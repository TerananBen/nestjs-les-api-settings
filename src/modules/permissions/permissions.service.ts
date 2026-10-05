import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Permission } from '../../database/entities/setting-management/permission.entity';
import { SETTING_MGMT_CONNECTION } from '../../database/constants';
import { UserManagementService } from '../user-management/user-management.service';
import { SYSTEM_MENUS, SYSTEM_MENU_MAP } from './constants/menu-list.constant';
import {
  MenuPermissionResponseDto,
  PermissionMatrixResponseDto,
} from './dto/menu-permission-response.dto';
import { UpdateMatrixDto } from './dto/update-matrix.dto';

@Injectable()
export class PermissionsService {
  private readonly logger = new Logger(PermissionsService.name);

  constructor(
    @InjectRepository(Permission, SETTING_MGMT_CONNECTION)
    private readonly permissionRepository: Repository<Permission>,
    private readonly userManagementService: UserManagementService,
  ) {}

  /**
   * Helper to find menu definition by menu_id (e.g. '1') or menu_name (e.g. 'dashboard_group')
   */
  private resolveMenuDef(identifier: string) {
    // Try matching ID
    const byId = SYSTEM_MENU_MAP.get(identifier);
    if (byId) return byId;

    // Try matching name
    const byName = SYSTEM_MENUS.find((m) => m.name === identifier);
    if (byName) return byName;

    return null;
  }

  /**
   * 3.1 Client Menu Permissions: GET /api/permissions/my-menus
   * 1. Query role_id from user_management DB using role_name
   * 2. Query permissions table in setting_management DB where readable = '1'
   */
  async getMyMenus(
    roleNames: string[],
    projectId: string,
  ): Promise<MenuPermissionResponseDto[]> {
    if (!projectId) {
      this.logger.warn('getMyMenus called without projectId');
      return [];
    }

    if (!roleNames || roleNames.length === 0) {
      this.logger.warn('getMyMenus called without role names');
      return [];
    }

    const isSuperAdmin = roleNames.some((r) => r.toLowerCase() === 'superadmin');

    // Step 1: Find role_id in user_management DB (project-scoped or realm)
    const matchingRole = await this.userManagementService.findFirstMatchingRole(roleNames, projectId);

    if (!matchingRole) {
      this.logger.warn(
        `No matching role found in user_management DB for roles: [${roleNames.join(', ')}] on project '${projectId}'`,
      );
      if (isSuperAdmin) {
        return SYSTEM_MENUS.map((menuDef) => ({
          menu_id: menuDef.id,
          menu_name: menuDef.name,
          label: menuDef.label,
          path: menuDef.path,
          readable: '1',
          writable: '1',
          control: '1',
        }));
      }
      return [];
    }

    const roleId = matchingRole.id;
    this.logger.log(
      `Resolved role '${matchingRole.name}' -> role_id '${roleId}' for project '${projectId}'`,
    );

    // If SuperAdmin, ensure default permissions exist in DB and return all 16 menus
    if (isSuperAdmin || matchingRole.name === 'SuperAdmin') {
      const existingCount = await this.permissionRepository.count({
        where: {
          role_id: roleId,
          project_id: projectId,
        },
      });
      if (existingCount === 0) {
        await this.initDefaultPermissions(projectId, roleId);
      }
      return SYSTEM_MENUS.map((menuDef) => ({
        menu_id: menuDef.id,
        menu_name: menuDef.name,
        label: menuDef.label,
        path: menuDef.path,
        readable: '1',
        writable: '1',
        control: '1',
      }));
    }

    // Step 2: Query permissions in setting_management DB
    let permissions = await this.permissionRepository.find({
      where: {
        role_id: roleId,
        project_id: projectId,
        readable: '1',
      },
    });

    // Fallback: If no permissions exist for this client role, inherit from realm role with the same name
    if (permissions.length === 0 && matchingRole) {
      const sameNameRoles = await this.userManagementService.findRolesByName(matchingRole.name);
      for (const r of sameNameRoles) {
        if (r.id !== roleId) {
          const fallbackPerms = await this.permissionRepository.find({
            where: {
              role_id: r.id,
              project_id: projectId,
              readable: '1',
            },
          });
          if (fallbackPerms.length > 0) {
            this.logger.log(
              `Inheriting ${fallbackPerms.length} permissions from role '${r.name}' (${r.id}) to client role '${matchingRole.name}' (${roleId})`,
            );
            const toSave = fallbackPerms.map((fp) =>
              this.permissionRepository.create({
                role_id: roleId,
                project_id: projectId,
                menu_name: fp.menu_name,
                readable: fp.readable,
                writable: fp.writable,
                control: fp.control,
              }),
            );
            await this.permissionRepository.save(toSave);
            permissions = toSave;
            break;
          }
        }
      }
    }

    // Fallback safeguard: If role is AdminManagement and no permissions exist for this project,
    // auto-initialize and load all system menus so superadmin is never locked out!
    if (permissions.length === 0 && (matchingRole.name === 'AdminManagement' || roleNames.includes('AdminManagement'))) {
      await this.initDefaultPermissions(projectId, roleId);
      permissions = await this.permissionRepository.find({
        where: {
          role_id: roleId,
          project_id: projectId,
          readable: '1',
        },
      });
    }

    // Step 3: Format response mapping to 16 system menus
    const result: MenuPermissionResponseDto[] = [];

    for (const perm of permissions) {
      const menuDef = this.resolveMenuDef(perm.menu_name);
      if (menuDef) {
        result.push({
          menu_id: menuDef.id,
          menu_name: menuDef.name,
          label: menuDef.label,
          path: menuDef.path,
          readable: perm.readable,
          writable: perm.writable,
          control: perm.control,
        });
      } else {
        // Menu not in standard 16 list, still include for custom menus
        result.push({
          menu_id: perm.menu_name,
          menu_name: perm.menu_name,
          label: perm.menu_name,
          path: `/${perm.menu_name}`,
          readable: perm.readable,
          writable: perm.writable,
          control: perm.control,
        });
      }
    }

    // Sort by standard menu order ID
    result.sort((a, b) => {
      const idA = parseInt(a.menu_id, 10) || 999;
      const idB = parseInt(b.menu_id, 10) || 999;
      return idA - idB;
    });

    return result;
  }

  /**
   * 3.2 Admin Matrix: GET /api/permissions/matrix
   * Query all 16 menus with permissions for the given role_id and project_id
   */
  async getMatrix(
    roleId: string,
    projectId: string,
  ): Promise<PermissionMatrixResponseDto> {
    let permissions = await this.permissionRepository.find({
      where: {
        role_id: roleId,
        project_id: projectId,
      },
    });

    const targetRole = await this.userManagementService.findRoleById(roleId);
    const isSuperAdminRole = targetRole?.name === 'SuperAdmin';

    // If role has no permissions saved yet, auto-init for SuperAdmin or preview template from same-name role
    if (permissions.length === 0 && targetRole) {
      if (isSuperAdminRole) {
        await this.initDefaultPermissions(projectId, roleId);
        permissions = await this.permissionRepository.find({
          where: {
            role_id: roleId,
            project_id: projectId,
          },
        });
      } else {
        const sameNameRoles = await this.userManagementService.findRolesByName(targetRole.name);
        for (const r of sameNameRoles) {
          if (r.id !== roleId) {
            const templatePerms = await this.permissionRepository.find({
              where: {
                role_id: r.id,
                project_id: projectId,
              },
            });
            if (templatePerms.length > 0) {
              permissions = templatePerms;
              break;
            }
          }
        }
      }
    }

    const permMap = new Map<string, Permission>();
    permissions.forEach((p) => {
      permMap.set(p.menu_name, p);
    });

    const menus: MenuPermissionResponseDto[] = SYSTEM_MENUS.map((menuDef) => {
      const existing = permMap.get(menuDef.name);
      return {
        menu_id: menuDef.id,
        menu_name: menuDef.name,
        label: menuDef.label,
        path: menuDef.path,
        readable: existing ? existing.readable : (isSuperAdminRole ? '1' : '0'),
        writable: existing ? existing.writable : (isSuperAdminRole ? '1' : '0'),
        control: existing ? existing.control : (isSuperAdminRole ? '1' : '0'),
      };
    });

    return {
      role_id: roleId,
      project_id: projectId,
      menus,
    };
  }

  /**
   * 3.2 Admin Matrix: PUT /api/permissions/matrix
   * Upsert permission items for role_id and project_id
   */
  async updateMatrix(
    dto: UpdateMatrixDto,
    updatedBy?: string,
  ): Promise<{ success: boolean; message: string; updated_count: number }> {
    const { role_id, project_id, permissions } = dto;

    if (!permissions || permissions.length === 0) {
      return { success: true, message: 'No permissions provided', updated_count: 0 };
    }

    const existingRows = await this.permissionRepository.find({
      where: {
        role_id,
        project_id,
      },
    });

    const existingMap = new Map<string, Permission>();
    existingRows.forEach((row) => existingMap.set(row.menu_name, row));

    const recordsToSave: Permission[] = [];

    for (const item of permissions) {
      const menuDef = this.resolveMenuDef(item.menu_id) || (item.menu_name ? this.resolveMenuDef(item.menu_name) : null);
      const menuName = menuDef ? menuDef.name : item.menu_name || item.menu_id;

      const existing = existingMap.get(menuName);

      if (existing) {
        existing.readable = item.readable ?? '0';
        existing.writable = item.writable ?? '0';
        existing.control = item.control ?? '0';
        existing.update_by = updatedBy;
        existing.update_timestamp = new Date();
        recordsToSave.push(existing);
      } else {
        const newPerm = this.permissionRepository.create({
          role_id,
          project_id,
          menu_name: menuName,
          readable: item.readable ?? '0',
          writable: item.writable ?? '0',
          control: item.control ?? '0',
          create_by: updatedBy,
          update_by: updatedBy,
        });
        recordsToSave.push(newPerm);
      }
    }

    await this.permissionRepository.save(recordsToSave);

    return {
      success: true,
      message: `Successfully updated permissions for role '${role_id}' on project '${project_id}'`,
      updated_count: recordsToSave.length,
    };
  }

  /**
   * 3.3 List Keycloak Application Roles for Role Dropdown
   */
  /**
   * 3.3 List Keycloak Application Roles for Role Dropdown
   */
  async getRoles(projectId?: string): Promise<{ id: string; name: string; code: string }[]> {
    return this.userManagementService.getApplicationRoles(projectId);
  }

  /**
   * Initialize default permissions for a project (System settings group for AdminManagement)
   */
  async initDefaultPermissions(projectId: string, targetRoleId?: string, createdBy?: string): Promise<void> {
    try {
      let roleId = targetRoleId;
      if (!roleId) {
        const adminRole = await this.userManagementService.findFirstMatchingRole(['SuperAdmin', 'AdminManagement'], projectId);
        if (adminRole) {
          roleId = adminRole.id;
        }
      }

      if (!roleId) {
        this.logger.warn(`SuperAdmin or AdminManagement role not found, cannot initialize permissions for project ${projectId}`);
        return;
      }

      const defaultMenus = SYSTEM_MENUS.map((m) => m.name);

      const existing = await this.permissionRepository.find({
        where: {
          role_id: roleId,
          project_id: projectId,
        },
      });

      const existingMenuNames = new Set(existing.map((e) => e.menu_name));
      const permsToCreate: Permission[] = [];

      for (const menuName of defaultMenus) {
        if (!existingMenuNames.has(menuName)) {
          permsToCreate.push(
            this.permissionRepository.create({
              role_id: roleId,
              project_id: projectId,
              menu_name: menuName,
              readable: '1',
              writable: '1',
              control: '1',
              create_by: createdBy,
              update_by: createdBy,
            }),
          );
        }
      }

      if (permsToCreate.length > 0) {
        await this.permissionRepository.save(permsToCreate);
        this.logger.log(
          `Initialized default permissions for project '${projectId}' (role '${roleId}') with menus: [${permsToCreate.map((p) => p.menu_name).join(', ')}]`,
        );
      }
    } catch (err) {
      this.logger.error(`Failed to initialize default permissions for project '${projectId}':`, err);
    }
  }
}

