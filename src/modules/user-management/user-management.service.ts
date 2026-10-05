import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, In, DataSource } from 'typeorm';
import { KeycloakRole } from '../../database/entities/user-management/keycloak-role.entity';
import { Project } from '../../database/entities/setting-management/project.entity';
import { USER_MGMT_CONNECTION, SETTING_MGMT_CONNECTION } from '../../database/constants';
import { getKeycloakConfig } from '../../config/keycloak.config';
import {
  KeycloakUserDto,
  CreateUserDto,
  UpdateUserDto,
  ProjectRoleDto,
} from './dto/user.dto';

interface DbUserRow {
  id: string;
  username: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  enabled: boolean;
  created_timestamp: string;
  role_id: string | null;
  role_name: string | null;
  is_superadmin: boolean | null;
  project_ids: string[] | null;
  roles_per_client: {
    roleId: string;
    roleName: string;
    clientId: string | null;
    clientUuid: string | null;
  }[] | null;
  last_login: string | null;
}

@Injectable()
export class UserManagementService {
  private readonly logger = new Logger(UserManagementService.name);
  private adminToken: string | null = null;
  private tokenExpiresAt = 0;

  private readonly friendlyNameMap: Record<string, string> = {
    SuperAdmin: 'SuperAdmin',
    AdminManagement: 'Admin Management',
    Privilege: 'Privilege',
    Admin: 'Admin',
    Management: 'Management',
    Operator: 'Operator',
  };

  constructor(
    @InjectRepository(KeycloakRole, USER_MGMT_CONNECTION)
    private readonly roleRepository: Repository<KeycloakRole>,
    @InjectRepository(Project, SETTING_MGMT_CONNECTION)
    private readonly projectRepository: Repository<Project>,
    @InjectDataSource(USER_MGMT_CONNECTION)
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Acquire or return cached Keycloak Admin Access Token
   */
  private async getKeycloakAdminToken(): Promise<string> {
    const now = Date.now();
    if (this.adminToken && this.tokenExpiresAt > now + 30000) {
      return this.adminToken;
    }

    const config = getKeycloakConfig();
    const tokenUrl = `${config.baseUrl}/realms/master/protocol/openid-connect/token`;

    const body = new URLSearchParams();
    body.append('grant_type', 'client_credentials');
    body.append('client_id', config.clientId);
    if (config.clientSecret) {
      body.append('client_secret', config.clientSecret);
    }

    try {
      const res = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`Failed to obtain admin token: ${res.status} ${errText}`);
      }

      const data = (await res.json()) as { access_token: string; expires_in: number };
      this.adminToken = data.access_token;
      this.tokenExpiresAt = now + data.expires_in * 1000;
      return this.adminToken;
    } catch (err: unknown) {
      this.logger.error('Error fetching Keycloak admin token:', err);
      throw new InternalServerErrorException('Failed to authenticate with Keycloak Admin API');
    }
  }

  /**
   * Helper: Map any raw project codes or UUIDs to their canonical UUIDs
   */
  private mapProjectIdsToUuids(rawIds: string[] | null, projects: Project[]): string[] {
    if (!rawIds || !Array.isArray(rawIds) || rawIds.length === 0) return [];
    const set = new Set<string>();
    for (const raw of rawIds) {
      if (!raw) continue;
      const clean = raw.trim();
      const cleanLower = clean.toLowerCase();
      const found = projects.find(
        (p) =>
          p.id.toLowerCase() === cleanLower ||
          p.code?.toLowerCase() === cleanLower ||
          p.code?.toLowerCase().replace(/_/g, '-') === cleanLower.replace(/_/g, '-') ||
          p.code?.toLowerCase().replace(/-/g, '_') === cleanLower.replace(/-/g, '_') ||
          p.name?.toLowerCase().replace(/\s+/g, '-') === cleanLower ||
          p.domain?.toLowerCase().split('.')[0] === cleanLower,
      );
      if (found) {
        set.add(found.id);
      } else {
        set.add(clean);
      }
    }
    return Array.from(set);
  }

  /**
   * Helper: Map roles per client to structured projectRoles array
   */
  private mapRolesPerClient(
    rolesPerClient: DbUserRow['roles_per_client'],
    allProjects: Project[],
  ): { projectId: string; projectName?: string; roleId: string; roleName: string }[] {
    if (!rolesPerClient || !Array.isArray(rolesPerClient)) return [];

    const projectLookup = new Map<string, Project>();
    allProjects.forEach((p) => {
      projectLookup.set(p.id.toLowerCase(), p);
      if (p.code) {
        projectLookup.set(p.code.toLowerCase(), p);
        projectLookup.set(p.code.toLowerCase().replace(/_/g, '-'), p);
        projectLookup.set(p.code.toLowerCase().replace(/-/g, '_'), p);
      }
      if (p.domain) {
        const sub = p.domain.split('.')[0].toLowerCase();
        projectLookup.set(sub, p);
      }
    });

    const result: { projectId: string; projectName?: string; roleId: string; roleName: string }[] = [];
    const seen = new Set<string>();

    for (const item of rolesPerClient) {
      if (!item || !item.roleId) continue;
      const key = `${item.clientId || ''}:${item.roleId}`;
      if (seen.has(key)) continue;
      seen.add(key);

      let project: Project | undefined;
      if (item.clientId) {
        project = projectLookup.get(item.clientId.toLowerCase());
      }
      const projectId = project ? project.id : (item.clientId || '');
      const projectName = project ? project.name : (item.clientId || '');
      const roleName = this.friendlyNameMap[item.roleName] || item.roleName.replace(/([A-Z])/g, ' $1').trim();

      if (projectId) {
        result.push({
          projectId,
          projectName,
          roleId: item.roleId,
          roleName,
        });
      }
    }

    return result;
  }

  /**
   * Helper: Resolve both project codes and UUIDs for Keycloak attributes
   */
  private async resolveProjectAttributes(projectIds?: string[]): Promise<{ projectCodes: string[]; projectUuids: string[] }> {
    if (!projectIds || projectIds.length === 0) {
      return { projectCodes: [], projectUuids: [] };
    }
    const allProjects = await this.projectRepository.find();
    const codes = new Set<string>();
    const uuids = new Set<string>();

    for (const rawId of projectIds) {
      if (!rawId) continue;
      const clean = rawId.trim();
      const cleanLower = clean.toLowerCase();

      const found = allProjects.find(
        (p) =>
          p.id.toLowerCase() === cleanLower ||
          p.code?.toLowerCase() === cleanLower ||
          p.code?.toLowerCase().replace(/_/g, '-') === cleanLower.replace(/_/g, '-') ||
          p.code?.toLowerCase().replace(/-/g, '_') === cleanLower.replace(/-/g, '_') ||
          p.name?.toLowerCase().replace(/\s+/g, '-') === cleanLower ||
          p.domain?.toLowerCase().split('.')[0] === cleanLower,
      );

      if (found) {
        const codeVal = found.code || found.name.toLowerCase().replace(/\s+/g, '-');
        codes.add(codeVal);
        uuids.add(found.id);
      } else {
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clean)) {
          uuids.add(clean);
        } else {
          codes.add(clean);
        }
      }
    }

    return {
      projectCodes: Array.from(codes),
      projectUuids: Array.from(uuids),
    };
  }

  /**
   * Helper: Synchronize user project attributes directly in Keycloak DB
   */
  private async syncUserProjectAttributes(
    userId: string,
    projectCodes: string[],
  ): Promise<void> {
    try {
      await this.dataSource.transaction(async (manager) => {
        await manager.query(
          `DELETE FROM user_attribute WHERE user_id = $1 AND name IN ('projectID', 'projectCode', 'project_id', 'project_code')`,
          [userId],
        );
        for (const code of projectCodes) {
          await manager.query(
            `INSERT INTO user_attribute (id, user_id, name, value) VALUES (gen_random_uuid(), $1, 'projectCode', $2)`,
            [userId, code],
          );
        }
      });
    } catch (err) {
      this.logger.error(`Failed to direct sync project attributes for user ${userId}:`, err);
    }
  }

  /**
   * 1. Query all users from Keycloak DB for Realm 'les'
   */
  async getUsers(projectId?: string): Promise<KeycloakUserDto[]> {
    let clientCondition = '';
    const queryParams: unknown[] = [];

    if (projectId) {
      const client = await this.resolveKeycloakClient(projectId);
      if (client) {
        queryParams.push(client.id);
        clientCondition = `AND (r.client IS NULL OR r.client = $1)`;
      }
    }

    const query = `
      SELECT 
        u.id, 
        u.username, 
        u.first_name, 
        u.last_name, 
        u.email, 
        u.enabled, 
        u.created_timestamp,
        MAX(r.id) as role_id,
        MAX(r.name) as role_name,
        BOOL_OR(LOWER(r.name) = 'superadmin' OR LOWER(r.name) = 'super_admin') as is_superadmin,
        json_agg(DISTINCT ua.value) FILTER (WHERE ua.name IN ('projectCode', 'project_code')) as project_ids,
        json_agg(DISTINCT jsonb_build_object(
          'roleId', r.id,
          'roleName', r.name,
          'clientId', c.client_id,
          'clientUuid', c.id
        )) FILTER (WHERE r.id IS NOT NULL) as roles_per_client,
        GREATEST(
          MAX(to_char(to_timestamp(e.event_time / 1000) AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD HH24:MI:SS')),
          MAX(ua_login.value)
        ) as last_login
      FROM user_entity u
      JOIN realm rm ON u.realm_id = rm.id AND rm.name = 'les'
      LEFT JOIN user_role_mapping urm ON u.id = urm.user_id
      LEFT JOIN keycloak_role r ON urm.role_id = r.id 
        AND r.name NOT LIKE 'default-roles-%'
        AND r.name NOT LIKE 'manage-%'
        AND r.name NOT LIKE 'view-%'
        AND r.name NOT LIKE 'query-%'
        AND r.name NOT LIKE 'create-%'
        AND r.name NOT IN ('offline_access', 'uma_authorization', 'uma_protection', 'admin')
        ${clientCondition}
      LEFT JOIN client c ON r.client = c.id
      LEFT JOIN user_attribute ua ON u.id = ua.user_id
      LEFT JOIN user_attribute ua_login ON u.id = ua_login.user_id AND ua_login.name = 'last_login'
      LEFT JOIN event_entity e ON u.id = e.user_id AND e.type = 'LOGIN'
      WHERE u.service_account_client_link IS NULL
      GROUP BY u.id, u.username, u.first_name, u.last_name, u.email, u.enabled, u.created_timestamp
      ORDER BY u.created_timestamp ASC
    `;

    const [rows, allProjects] = await Promise.all([
      this.dataSource.query(query, queryParams) as Promise<DbUserRow[]>,
      this.projectRepository.find(),
    ]);

    return rows.map((r) => {
      const isSuper = Boolean(r.is_superadmin) || (r.role_name || '').toLowerCase() === 'superadmin';
      return {
        id: r.id,
        username: r.username,
        firstName: r.first_name || '',
        lastName: r.last_name || '',
        email: r.email || '',
        enabled: Boolean(r.enabled),
        roleId: isSuper ? '855125b5-a3ea-48aa-a9e7-7e5abbecfaca' : (r.role_id || ''),
        roleName: isSuper ? 'SuperAdmin' : (r.role_name ? (this.friendlyNameMap[r.role_name] || r.role_name) : ''),
        projectIds: isSuper ? allProjects.map((p) => p.id) : this.mapProjectIdsToUuids(r.project_ids, allProjects),
        projectRoles: isSuper ? [] : this.mapRolesPerClient(r.roles_per_client, allProjects),
        createdTimestamp: r.created_timestamp,
        lastLogin: r.last_login || undefined,
      };
    });
  }

  /**
   * 2. Get user by ID
   */
  async getUserById(id: string): Promise<KeycloakUserDto> {
    const query = `
      SELECT 
        u.id, 
        u.username, 
        u.first_name, 
        u.last_name, 
        u.email, 
        u.enabled, 
        u.created_timestamp,
        MAX(r.id) as role_id,
        MAX(r.name) as role_name,
        BOOL_OR(LOWER(r.name) = 'superadmin' OR LOWER(r.name) = 'super_admin') as is_superadmin,
        json_agg(DISTINCT ua.value) FILTER (WHERE ua.name IN ('projectCode', 'project_code')) as project_ids,
        json_agg(DISTINCT jsonb_build_object(
          'roleId', r.id,
          'roleName', r.name,
          'clientId', c.client_id,
          'clientUuid', c.id
        )) FILTER (WHERE r.id IS NOT NULL) as roles_per_client,
        GREATEST(
          MAX(to_char(to_timestamp(e.event_time / 1000) AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD HH24:MI:SS')),
          MAX(ua_login.value)
        ) as last_login
      FROM user_entity u
      JOIN realm rm ON u.realm_id = rm.id AND rm.name = 'les'
      LEFT JOIN user_role_mapping urm ON u.id = urm.user_id
      LEFT JOIN keycloak_role r ON urm.role_id = r.id 
        AND r.name NOT LIKE 'default-roles-%'
        AND r.name NOT LIKE 'manage-%'
        AND r.name NOT LIKE 'view-%'
        AND r.name NOT LIKE 'query-%'
        AND r.name NOT LIKE 'create-%'
        AND r.name NOT IN ('offline_access', 'uma_authorization', 'uma_protection', 'admin')
      LEFT JOIN client c ON r.client = c.id
      LEFT JOIN user_attribute ua ON u.id = ua.user_id
      LEFT JOIN user_attribute ua_login ON u.id = ua_login.user_id AND ua_login.name = 'last_login'
      LEFT JOIN event_entity e ON u.id = e.user_id AND e.type = 'LOGIN'
      WHERE u.id = $1
      GROUP BY u.id, u.username, u.first_name, u.last_name, u.email, u.enabled, u.created_timestamp
    `;

    const [rows, allProjects] = await Promise.all([
      this.dataSource.query(query, [id]) as Promise<DbUserRow[]>,
      this.projectRepository.find(),
    ]);
    if (!rows || rows.length === 0) {
      throw new NotFoundException(`User with ID '${id}' not found`);
    }

    const r = rows[0];
    const isSuper = Boolean(r.is_superadmin) || (r.role_name || '').toLowerCase() === 'superadmin';
    return {
      id: r.id,
      username: r.username,
      firstName: r.first_name || '',
      lastName: r.last_name || '',
      email: r.email || '',
      enabled: Boolean(r.enabled),
      roleId: isSuper ? '855125b5-a3ea-48aa-a9e7-7e5abbecfaca' : (r.role_id || ''),
      roleName: isSuper ? 'SuperAdmin' : (r.role_name ? (this.friendlyNameMap[r.role_name] || r.role_name) : ''),
      projectIds: isSuper ? allProjects.map((p) => p.id) : this.mapProjectIdsToUuids(r.project_ids, allProjects),
      projectRoles: isSuper ? [] : this.mapRolesPerClient(r.roles_per_client, allProjects),
      createdTimestamp: r.created_timestamp,
      lastLogin: r.last_login || undefined,
    };
  }

  /**
   * 3. Check if username exists in Keycloak (Realm 'les')
   */
  async checkUsername(username: string): Promise<{ exists: boolean }> {
    const query = `
      SELECT u.id
      FROM user_entity u
      JOIN realm rm ON u.realm_id = rm.id AND rm.name = 'les'
      WHERE LOWER(u.username) = LOWER($1)
      LIMIT 1
    `;
    const rows = await this.dataSource.query(query, [username.trim()]);
    return { exists: rows.length > 0 };
  }

  /**
   * Check if user exists and has email configured for Forgot Password flow
   */
  async checkResetUser(identifier: string): Promise<{
    exists: boolean;
    hasEmail: boolean;
    email?: string | null;
    status: 'USER_NOT_FOUND' | 'NO_EMAIL' | 'VALID';
  }> {
    if (!identifier || !identifier.trim()) {
      return { exists: false, hasEmail: false, status: 'USER_NOT_FOUND' };
    }
    const clean = identifier.trim().toLowerCase();
    const query = `
      SELECT u.id, u.username, u.email, u.service_account_client_link
      FROM user_entity u
      JOIN realm rm ON u.realm_id = rm.id AND rm.name = 'les'
      WHERE (LOWER(u.username) = $1 OR LOWER(u.email) = $1)
      LIMIT 1
    `;
    const rows = await this.dataSource.query(query, [clean]);
    if (!rows || rows.length === 0) {
      return { exists: false, hasEmail: false, status: 'USER_NOT_FOUND' };
    }
    const user = rows[0];
    if (user.service_account_client_link || !user.email || !user.email.trim()) {
      return { exists: true, hasEmail: false, status: 'NO_EMAIL' };
    }
    return {
      exists: true,
      hasEmail: true,
      email: user.email.trim(),
      status: 'VALID',
    };
  }

  /**
   * Check if user's email is verified in Keycloak DB (Realm 'les')
   */
  async checkEmailVerified(email?: string, username?: string): Promise<{ verified: boolean }> {
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanUser = (username || '').trim().toLowerCase();
    if (!cleanEmail && !cleanUser) {
      return { verified: false };
    }

    const query = `
      SELECT u.email_verified
      FROM user_entity u
      JOIN realm rm ON u.realm_id = rm.id AND rm.name = 'les'
      WHERE ($1 != '' AND LOWER(u.email) = $1)
         OR ($2 != '' AND LOWER(u.username) = $2)
      LIMIT 1
    `;
    const rows = await this.dataSource.query(query, [cleanEmail, cleanUser]);
    if (rows && rows.length > 0) {
      return { verified: Boolean(rows[0].email_verified) };
    }
    return { verified: false };
  }

  /**
   * 4. Create user in Keycloak (Realm 'les')
   */
  async createUser(dto: CreateUserDto): Promise<{ success: boolean; id: string }> {
    const config = getKeycloakConfig();
    const token = await this.getKeycloakAdminToken();

    const effectiveProjectIds =
      dto.projectRoles && dto.projectRoles.length > 0
        ? dto.projectRoles.map((pr) => pr.projectId)
        : dto.projectIds;

    const { projectCodes, projectUuids } = await this.resolveProjectAttributes(effectiveProjectIds);

    // 1. Create User via Keycloak Admin API
    const userPayload: Record<string, unknown> = {
      username: dto.username,
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      enabled: dto.enabled !== undefined ? dto.enabled : true,
      emailVerified: false,
      credentials: [
        {
          type: 'password',
          value: dto.password,
          temporary: true,
        },
      ],
      attributes: {
        locale: ['th'],
        projectCode: projectCodes,
      },
    };

    const res = await fetch(`${config.baseUrl}/admin/realms/les/users`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(userPayload),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => '');
      this.logger.error(`Create user error: ${res.status} ${err}`);
      throw new BadRequestException(`Failed to create user in Keycloak: ${err}`);
    }

    // Extract created user ID from Location header
    const location = res.headers.get('location') || '';
    let newUserId = location.split('/').pop() || '';

    // If Location header didn't give ID, find it from DB
    if (!newUserId) {
      const check = await this.dataSource.query(
        `SELECT u.id FROM user_entity u JOIN realm rm ON u.realm_id = rm.id AND rm.name = 'les' WHERE u.username = $1`,
        [dto.username],
      );
      if (check.length > 0) {
        newUserId = check[0].id;
      }
    }

    // 2. Assign Roles
    let isSuperAdmin = false;
    let resolvedSuperAdminRoleId = dto.roleId;
    if (dto.roleId) {
      const lower = dto.roleId.toLowerCase();
      if (lower === 'superadmin' || lower === 'adminmanagement') {
        isSuperAdmin = true;
        const found = await this.roleRepository.findOne({ where: { name: 'SuperAdmin', client_role: false } });
        if (found) resolvedSuperAdminRoleId = found.id;
      } else {
        const r = await this.roleRepository.findOne({ where: [{ id: dto.roleId }, { name: dto.roleId }] });
        if (r && (r.name.toLowerCase() === 'superadmin' || r.name.toLowerCase() === 'adminmanagement')) {
          isSuperAdmin = true;
          resolvedSuperAdminRoleId = r.id;
        }
      }
    }

    if (newUserId) {
      if (isSuperAdmin) {
        await this.assignRoleToUser(newUserId, resolvedSuperAdminRoleId || 'SuperAdmin', token);
        const allProjects = await this.projectRepository.find();
        const allCodes = allProjects.map((p) => p.code || p.name.toLowerCase().replace(/\s+/g, '-')).filter(Boolean);
        await this.syncUserProjectAttributes(newUserId, allCodes);
      } else {
        if (dto.projectRoles && dto.projectRoles.length > 0) {
          await this.assignProjectRolesToUser(newUserId, dto.projectRoles, token);
        } else if (dto.roleId) {
          await this.assignRoleToUser(newUserId, dto.roleId, token);
        }

        // 3. Direct DB attribute sync to ensure projectCode is written
        if (projectCodes.length > 0) {
          await this.syncUserProjectAttributes(newUserId, projectCodes);
        }
      }
    }

    return { success: true, id: newUserId };
  }

  /**
   * 5. Update user in Keycloak (Realm 'les')
   */
  async updateUser(id: string, dto: UpdateUserDto): Promise<{ success: boolean }> {
    const config = getKeycloakConfig();
    const token = await this.getKeycloakAdminToken();

    const effectiveProjectIds =
      dto.projectRoles !== undefined
        ? dto.projectRoles.map((pr) => pr.projectId)
        : dto.projectIds;

    const userPayload: Record<string, unknown> = {};
    if (dto.firstName !== undefined) userPayload.firstName = dto.firstName;
    if (dto.lastName !== undefined) userPayload.lastName = dto.lastName;
    if (dto.email !== undefined) userPayload.email = dto.email;
    if (dto.enabled !== undefined) userPayload.enabled = dto.enabled;
    if (effectiveProjectIds !== undefined) {
      const { projectCodes } = await this.resolveProjectAttributes(effectiveProjectIds);
      let existingAttributes: Record<string, unknown> = {};
      try {
        const getRes = await fetch(`${config.baseUrl}/admin/realms/les/users/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (getRes.ok) {
          const userJson = (await getRes.json()) as { attributes?: Record<string, unknown> };
          existingAttributes = userJson.attributes || {};
        }
      } catch (e) {
        this.logger.warn(`Could not fetch existing attributes for user ${id}: ${e}`);
      }

      userPayload.attributes = {
        ...existingAttributes,
        locale: existingAttributes.locale || ['th'],
        projectCode: projectCodes,
      };
    }

    // Update profile
    const updateRes = await fetch(`${config.baseUrl}/admin/realms/les/users/${id}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(userPayload),
    });

    if (!updateRes.ok) {
      const err = await updateRes.text().catch(() => '');
      this.logger.error(`Update user error: ${updateRes.status} ${err}`);
      throw new BadRequestException(`Failed to update user in Keycloak: ${err}`);
    }

    // Direct DB attribute sync to guarantee stale project rows are purged and active ones are inserted
    if (effectiveProjectIds !== undefined) {
      const { projectCodes } = await this.resolveProjectAttributes(effectiveProjectIds);
      await this.syncUserProjectAttributes(id, projectCodes);
    }

    // Update password if provided
    if (dto.password && dto.password.trim().length > 0) {
      const passRes = await fetch(`${config.baseUrl}/admin/realms/les/users/${id}/reset-password`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'password',
          value: dto.password,
          temporary: false,
        }),
      });
      if (!passRes.ok) {
        this.logger.warn(`Failed to update password for user ${id}`);
      }
    }

    // Update roles
    let isSuperAdmin = false;
    let resolvedSuperAdminRoleId = dto.roleId;
    if (dto.roleId) {
      const lower = dto.roleId.toLowerCase();
      if (lower === 'superadmin' || lower === 'adminmanagement') {
        isSuperAdmin = true;
        const found = await this.roleRepository.findOne({ where: { name: 'SuperAdmin', client_role: false } });
        if (found) resolvedSuperAdminRoleId = found.id;
      } else {
        const r = await this.roleRepository.findOne({ where: [{ id: dto.roleId }, { name: dto.roleId }] });
        if (r && (r.name.toLowerCase() === 'superadmin' || r.name.toLowerCase() === 'adminmanagement')) {
          isSuperAdmin = true;
          resolvedSuperAdminRoleId = r.id;
        }
      }
    }

    if (isSuperAdmin) {
      await this.assignRoleToUser(id, resolvedSuperAdminRoleId || 'SuperAdmin', token);
      try {
        await this.dataSource.query(
          `DELETE FROM user_role_mapping urm USING keycloak_role r WHERE urm.user_id = $1 AND urm.role_id = r.id AND r.client_role = true`,
          [id],
        );
      } catch (err) {
        this.logger.warn(`Could not purge client roles for SuperAdmin user ${id}: ${err}`);
      }
      const allProjects = await this.projectRepository.find();
      const allCodes = allProjects.map((p) => p.code || p.name.toLowerCase().replace(/\s+/g, '-')).filter(Boolean);
      await this.syncUserProjectAttributes(id, allCodes);
    } else {
      if (dto.projectRoles !== undefined) {
        await this.assignProjectRolesToUser(id, dto.projectRoles, token);
      } else if (dto.roleId) {
        await this.assignRoleToUser(id, dto.roleId, token);
      }
    }

    return { success: true };
  }

  /**
   * 6. Update user status (enabled/disabled)
   */
  async updateUserStatus(id: string, enabled: boolean): Promise<{ success: boolean }> {
    const config = getKeycloakConfig();
    const token = await this.getKeycloakAdminToken();

    const res = await fetch(`${config.baseUrl}/admin/realms/les/users/${id}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ enabled }),
    });

    if (!res.ok) {
      // Fallback direct DB update if API fails
      await this.dataSource.query(`UPDATE user_entity SET enabled = $1 WHERE id = $2`, [enabled, id]);
    }

    return { success: true };
  }

  /**
   * 7. Delete user from Keycloak
   */
  async deleteUser(id: string): Promise<{ success: boolean }> {
    const config = getKeycloakConfig();
    const token = await this.getKeycloakAdminToken();

    const res = await fetch(`${config.baseUrl}/admin/realms/les/users/${id}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new BadRequestException(`Failed to delete user: ${err}`);
    }

    return { success: true };
  }

  /**
   * Helper: Resolve Keycloak Client (UUID & client_id) by Project ID, Domain Subdomain, or Slug
   */
  async resolveKeycloakClient(projectIdOrSlug?: string): Promise<{ id: string; client_id: string } | null> {
    if (!projectIdOrSlug) return null;
    const clean = projectIdOrSlug.trim();

    const candidateSlugs: string[] = [clean, clean.toLowerCase(), clean.replace(/_/g, '-'), clean.replace(/-/g, '_')];

    // If clean is a UUID, find project from setting_management DB
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clean);
    if (isUuid) {
      try {
        const project = await this.projectRepository.findOne({ where: { id: clean } });
        if (project) {
          if (project.code) {
            candidateSlugs.push(project.code, project.code.replace(/_/g, '-'), project.code.replace(/-/g, '_'));
          }
          if (project.domain) {
            const sub = project.domain.split('.')[0].toLowerCase();
            candidateSlugs.push(sub, sub.replace(/_/g, '-'), sub.replace(/-/g, '_'));
          }
          if (project.name) {
            const nameSlug = project.name.toLowerCase().replace(/\s+/g, '-');
            candidateSlugs.push(nameSlug, nameSlug.replace(/-/g, '_'));
          }
        }
      } catch (err) {
        this.logger.warn(`Could not lookup project ${clean}: ${err}`);
      }
    }

    const uniqueCandidates = Array.from(new Set(candidateSlugs.filter(Boolean)));

    // Query client in user_management DB
    const query = `
      SELECT id, client_id 
      FROM client 
      WHERE client_id = ANY($1) OR id = $2 
      LIMIT 1
    `;
    const rows = await this.dataSource.query(query, [uniqueCandidates, isUuid ? clean : '00000000-0000-0000-0000-000000000000']);
    if (rows && rows.length > 0) {
      return { id: rows[0].id, client_id: rows[0].client_id };
    }

    return null;
  }

  /**
   * Helper: Assign multiple project-scoped client roles to User in Keycloak
   */
  async assignProjectRolesToUser(
    userId: string,
    projectRoles: ProjectRoleDto[],
    token: string,
  ): Promise<void> {
    const config = getKeycloakConfig();
    const allProjects = await this.projectRepository.find();

    // 1. Get all project client UUIDs so we know which clients belong to projects
    const projectClientUuids = new Set<string>();
    const clientMap = new Map<string, { id: string; client_id: string }>();

    for (const p of allProjects) {
      const client = await this.resolveKeycloakClient(p.id);
      if (client) {
        projectClientUuids.add(client.id);
        clientMap.set(p.id.toLowerCase(), client);
        if (p.code) clientMap.set(p.code.toLowerCase(), client);
        if (p.domain) clientMap.set(p.domain.split('.')[0].toLowerCase(), client);
      }
    }

    // 2. Query all current client roles assigned to this user in user_management DB
    const currentRolesQuery = `
      SELECT urm.role_id, r.name as role_name, r.client as client_uuid, c.client_id
      FROM user_role_mapping urm
      JOIN keycloak_role r ON urm.role_id = r.id
      JOIN client c ON r.client = c.id
      WHERE urm.user_id = $1
        AND r.client_role = true
    `;
    const currentAssignments: { role_id: string; role_name: string; client_uuid: string; client_id: string }[] =
      await this.dataSource.query(currentRolesQuery, [userId]);

    // Build target map of client_uuid -> target role
    const targetRolesByClientUuid = new Map<string, KeycloakRole>();

    for (const pr of projectRoles) {
      if (!pr.projectId || !pr.roleId) continue;
      let client = clientMap.get(pr.projectId.toLowerCase());
      if (!client) {
        client = await this.resolveKeycloakClient(pr.projectId);
      }
      if (!client) {
        this.logger.warn(`Could not resolve client for project '${pr.projectId}'`);
        continue;
      }

      projectClientUuids.add(client.id);

      // Resolve role on this client
      let role = await this.roleRepository.findOne({
        where: { id: pr.roleId, client: client.id, client_role: true },
      });
      if (!role) {
        const candidateRole = await this.roleRepository.findOne({ where: { id: pr.roleId } });
        const roleName = candidateRole ? candidateRole.name : pr.roleId;
        role = await this.roleRepository.findOne({
          where: { name: roleName, client: client.id, client_role: true },
        });
      }

      if (role) {
        targetRolesByClientUuid.set(client.id, role);
      } else {
        this.logger.warn(`Role '${pr.roleId}' not found on client '${client.client_id}' (${client.id})`);
      }
    }

    // 3. For each project client, update role mappings via Keycloak Admin API
    for (const clientUuid of projectClientUuids) {
      const clientUrl = `${config.baseUrl}/admin/realms/les/users/${userId}/role-mappings/clients/${clientUuid}`;
      const targetRole = targetRolesByClientUuid.get(clientUuid);
      const existingForClient = currentAssignments.filter((a) => a.client_uuid === clientUuid);

      if (targetRole) {
        const alreadyHasRole = existingForClient.some((a) => a.role_id === targetRole.id);
        const staleRoles = existingForClient.filter(
          (a) =>
            a.role_id !== targetRole.id &&
            !a.role_name.startsWith('default-roles-') &&
            !a.role_name.startsWith('manage-') &&
            !a.role_name.startsWith('view-'),
        );

        if (staleRoles.length > 0) {
          await fetch(clientUrl, {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(staleRoles.map((r) => ({ id: r.role_id, name: r.role_name }))),
          });
        }

        if (!alreadyHasRole) {
          await fetch(clientUrl, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify([{ id: targetRole.id, name: targetRole.name }]),
          });
          this.logger.log(`Assigned client role '${targetRole.name}' (${targetRole.id}) on client '${clientUuid}' to user '${userId}'`);
        }
      } else {
        // User removed from project -> remove roles on this client
        const rolesToRemove = existingForClient.filter(
          (a) =>
            !a.role_name.startsWith('default-roles-') &&
            !a.role_name.startsWith('manage-') &&
            !a.role_name.startsWith('view-'),
        );
        if (rolesToRemove.length > 0) {
          await fetch(clientUrl, {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(rolesToRemove.map((r) => ({ id: r.role_id, name: r.role_name }))),
          });
          this.logger.log(`Removed unassigned client roles on '${clientUuid}' from user '${userId}'`);
        }
      }
    }

    // 4. Also synchronize matching realm role
    const assignedRoleNames = Array.from(new Set(Array.from(targetRolesByClientUuid.values()).map((r) => r.name)));
    if (assignedRoleNames.length > 0) {
      const priorityOrder = ['SuperAdmin', 'AdminManagement', 'Privilege', 'Admin', 'Management', 'Operator'];
      const topRoleName = assignedRoleNames.sort((a, b) => {
        const idxA = priorityOrder.indexOf(a);
        const idxB = priorityOrder.indexOf(b);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return a.localeCompare(b);
      })[0];

      const realmRole = await this.roleRepository.findOne({
        where: { name: topRoleName, client_role: false },
      });
      if (realmRole) {
        try {
          const realmUrl = `${config.baseUrl}/admin/realms/les/users/${userId}/role-mappings/realm`;
          await fetch(realmUrl, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify([{ id: realmRole.id, name: realmRole.name }]),
          });
        } catch (e) {
          this.logger.warn(`Could not sync realm role '${topRoleName}': ${e}`);
        }
      }
    }
  }

  /**
   * Helper: Assign Client Role or Realm Role to User in Keycloak
   */
  private async assignRoleToUser(userId: string, roleIdOrName: string, token: string): Promise<void> {
    const config = getKeycloakConfig();

    // 1. Resolve role
    let role = await this.roleRepository.findOne({ where: { id: roleIdOrName } });
    if (!role) {
      role = await this.roleRepository.findOne({ where: { name: roleIdOrName } });
    }
    if (!role) {
      this.logger.warn(`Role '${roleIdOrName}' not found, skipping role mapping`);
      return;
    }

    if (role.client_role && role.client) {
      // ── Client Role Mapping ───────────────────────────────
      // Keycloak endpoint: /admin/realms/les/users/{userId}/role-mappings/clients/{client_uuid}
      const clientUrl = `${config.baseUrl}/admin/realms/les/users/${userId}/role-mappings/clients/${role.client}`;

      // Fetch existing client roles for this client
      const existingRes = await fetch(clientUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (existingRes.ok) {
        const currentClientRoles = (await existingRes.json()) as { id: string; name: string }[];
        const rolesToDelete = currentClientRoles.filter(
          (r) => !r.name.startsWith('default-roles-') && !r.name.startsWith('manage-'),
        );
        if (rolesToDelete.length > 0) {
          await fetch(clientUrl, {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(rolesToDelete),
          });
        }
      }

      // Assign new client role
      await fetch(clientUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([{ id: role.id, name: role.name }]),
      });
      this.logger.log(`Assigned client role '${role.name}' (${role.id}) on client '${role.client}' to user '${userId}'`);
    } else {
      // ── Realm Role Mapping ────────────────────────────────
      const realmUrl = `${config.baseUrl}/admin/realms/les/users/${userId}/role-mappings/realm`;
      const existingRolesRes = await fetch(realmUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (existingRolesRes.ok) {
        const currentRoles = (await existingRolesRes.json()) as { id: string; name: string }[];
        const rolesToDelete = currentRoles.filter(
          (r) => !r.name.startsWith('default-roles-') && !r.name.startsWith('offline_access'),
        );
        if (rolesToDelete.length > 0) {
          await fetch(realmUrl, {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(rolesToDelete),
          });
        }
      }

      await fetch(realmUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([{ id: role.id, name: role.name }]),
      });
      this.logger.log(`Assigned realm role '${role.name}' (${role.id}) to user '${userId}'`);
    }
  }

  /**
   * Find role_id by role_name in user_management database (keycloak_role table)
   */
  async findRoleIdByName(roleName: string): Promise<string | null> {
    const role = await this.roleRepository.findOne({
      where: { name: roleName },
    });

    if (!role) {
      this.logger.warn(`Role '${roleName}' not found in keycloak_role table`);
      return null;
    }

    return role.id;
  }

  async findRolesByName(name: string): Promise<KeycloakRole[]> {
    return this.roleRepository.find({
      where: { name },
    });
  }

  /**
   * Find role by multiple possible role names (e.g. from token roles array)
   */
  async findFirstMatchingRole(roleNames: string[], projectId?: string): Promise<KeycloakRole | null> {
    if (!roleNames || roleNames.length === 0) return null;

    if (roleNames.some((r) => r.toLowerCase() === 'superadmin')) {
      const superAdminRole = await this.roleRepository.findOne({
        where: { name: 'SuperAdmin', client_role: false },
      });
      if (superAdminRole) return superAdminRole;
    }

    if (projectId) {
      const client = await this.resolveKeycloakClient(projectId);
      if (client) {
        const clientRoles = await this.roleRepository.find({
          where: { name: In(roleNames), client_role: true, client: client.id },
        });
        if (clientRoles.length > 0) {
          for (const name of roleNames) {
            const match = clientRoles.find((r) => r.name === name);
            if (match) return match;
          }
          return clientRoles[0];
        }
      }
    }

    const roles = await this.roleRepository.find({
      where: { name: In(roleNames), client_role: false },
    });

    if (roles.length === 0) {
      const anyRoles = await this.roleRepository.find({
        where: { name: In(roleNames) },
      });
      if (anyRoles.length === 0) return null;
      for (const name of roleNames) {
        const match = anyRoles.find((r) => r.name === name);
        if (match) return match;
      }
      return anyRoles[0];
    }

    for (const name of roleNames) {
      const match = roles.find((r) => r.name === name);
      if (match) return match;
    }

    return roles[0];
  }

  /**
   * Find role by ID
   */
  async findRoleById(id: string): Promise<KeycloakRole | null> {
    return this.roleRepository.findOne({
      where: { id },
    });
  }

  /**
   * List all roles from Keycloak
   */
  async getAllRoles(): Promise<KeycloakRole[]> {
    return this.roleRepository.find();
  }

  /**
   * Get active application roles from Keycloak for dropdown selection (Project-Scoped or Realm)
   */
  async getApplicationRoles(projectId?: string): Promise<{ id: string; name: string; code: string }[]> {
    const priorityOrder = ['SuperAdmin', 'AdminManagement', 'Privilege', 'Admin', 'Management', 'Operator'];

    if (projectId) {
      const client = await this.resolveKeycloakClient(projectId);
      if (client) {
        const clientRoles = await this.roleRepository.find({
          where: { client_role: true, client: client.id },
        });

        const filtered = clientRoles.filter(
          (r) =>
            !r.name.startsWith('default-roles-') &&
            !r.name.startsWith('manage-') &&
            !r.name.startsWith('view-') &&
            !r.name.startsWith('query-') &&
            !['offline_access', 'uma_authorization', 'uma_protection'].includes(r.name),
        );

        // Always include SuperAdmin realm role at the top for dropdown selection
        const superAdminRole = await this.roleRepository.findOne({
          where: { name: 'SuperAdmin', client_role: false },
        });

        const allRoles = superAdminRole ? [superAdminRole, ...filtered] : filtered;

        if (allRoles.length > 0) {
          return allRoles
            .map((r) => ({
              id: r.id,
              name: this.friendlyNameMap[r.name] || r.name.replace(/([A-Z])/g, ' $1').trim(),
              code: r.name,
            }))
            .sort((a, b) => {
              const idxA = priorityOrder.indexOf(a.code);
              const idxB = priorityOrder.indexOf(b.code);
              if (idxA !== -1 && idxB !== -1) return idxA - idxB;
              if (idxA !== -1) return -1;
              if (idxB !== -1) return 1;
              return a.name.localeCompare(b.name);
            });
        }
      }
    }

    // Fallback: realm roles
    const roles = await this.roleRepository.find({
      where: { client_role: false },
    });

    const systemRoleNames = new Set([
      'offline_access',
      'uma_authorization',
      'create-realm',
      'admin',
    ]);

    const appRoles = roles.filter(
      (r) =>
        !systemRoleNames.has(r.name) &&
        !r.name.startsWith('default-roles-') &&
        !r.name.startsWith('manage-') &&
        !r.name.startsWith('view-') &&
        !r.name.startsWith('query-'),
    );

    return appRoles
      .map((r) => ({
        id: r.id,
        name: this.friendlyNameMap[r.name] || r.name.replace(/([A-Z])/g, ' $1').trim(),
        code: r.name,
      }))
      .sort((a, b) => {
        const idxA = priorityOrder.indexOf(a.code);
        const idxB = priorityOrder.indexOf(b.code);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return a.name.localeCompare(b.name);
      });
  }

  /**
   * Auto-provision Keycloak Client & standard Client Roles for a newly created project
   */
  async provisionProjectClient(slug: string, displayName: string): Promise<void> {
    try {
      const config = getKeycloakConfig();
      const token = await this.getKeycloakAdminToken();
      const clientId = slug.toLowerCase().trim().replace(/[\s_]+/g, '-');

      // Check if client already exists
      const existingRes = await fetch(`${config.baseUrl}/admin/realms/les/clients?clientId=${encodeURIComponent(clientId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      let clientInternalId = '';
      if (existingRes.ok) {
        const list = (await existingRes.json()) as { id: string; clientId: string }[];
        if (list.length > 0) {
          clientInternalId = list[0].id;
        }
      }

      if (!clientInternalId) {
        // Create client
        const createRes = await fetch(`${config.baseUrl}/admin/realms/les/clients`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            clientId,
            name: displayName,
            enabled: true,
            protocol: 'openid-connect',
            publicClient: true,
            standardFlowEnabled: true,
            directAccessGrantsEnabled: false,
            rootUrl: `http://*.localhost:3008/*`,
            redirectUris: [
              `http://${clientId}.localhost:3008/*`,
              `http://${clientId}.localhost:3008/api/auth/callback/keycloak`,
              `http://${clientId.replace(/-/g, '_')}.localhost:3008/*`,
              `http://${clientId.replace(/-/g, '_')}.localhost:3008/api/auth/callback/keycloak`,
              'http://localhost:3008/*',
              'http://localhost:3008/api/auth/callback/keycloak',
            ],
            webOrigins: [
              `http://${clientId}.localhost:3008`,
              `http://${clientId.replace(/-/g, '_')}.localhost:3008`,
              'http://localhost:3008',
              '+',
            ],
          }),
        });

        if (createRes.ok) {
          const loc = createRes.headers.get('location') || '';
          clientInternalId = loc.split('/').pop() || '';
          if (!clientInternalId) {
            const fetchCheck = await fetch(`${config.baseUrl}/admin/realms/les/clients?clientId=${encodeURIComponent(clientId)}`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (fetchCheck.ok) {
              const checkData = (await fetchCheck.json()) as { id: string }[];
              if (checkData.length > 0) clientInternalId = checkData[0].id;
            }
          }
        }
      }

      if (clientInternalId) {
        // Create 5 standard Client Roles
        const standardRoles = ['AdminManagement', 'Privilege', 'Admin', 'Management', 'Operator'];
        for (const roleName of standardRoles) {
          await fetch(`${config.baseUrl}/admin/realms/les/clients/${clientInternalId}/roles`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              name: roleName,
              description: `${roleName} role for project ${displayName}`,
            }),
          }).catch(() => null);
        }
        this.logger.log(`Provisioned Keycloak client '${clientId}' with standard roles.`);
      }
    } catch (err) {
      this.logger.error(`Failed to provision Keycloak client for '${slug}':`, err);
    }
  }

  /**
   * Record user login timestamp in user_attribute
   */
  async recordLogin(identifier: string): Promise<{ success: boolean; lastLogin?: string }> {
    try {
      const now = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Bangkok' }).replace('T', ' ');

      const userCheck = await this.dataSource.query(
        `SELECT u.id FROM user_entity u JOIN realm rm ON u.realm_id = rm.id AND rm.name = 'les' WHERE u.id = $1 OR LOWER(u.username) = LOWER($1) LIMIT 1`,
        [identifier],
      );

      if (!userCheck || userCheck.length === 0) {
        return { success: false };
      }

      const userId = userCheck[0].id;

      const attrCheck = await this.dataSource.query(
        `SELECT id FROM user_attribute WHERE user_id = $1 AND name = 'last_login' LIMIT 1`,
        [userId],
      );

      if (attrCheck.length > 0) {
        await this.dataSource.query(
          `UPDATE user_attribute SET value = $1 WHERE id = $2`,
          [now, attrCheck[0].id],
        );
      } else {
        const crypto = await import('crypto');
        const newAttrId = crypto.randomUUID();
        await this.dataSource.query(
          `INSERT INTO user_attribute (id, name, value, user_id) VALUES ($1, 'last_login', $2, $3)`,
          [newAttrId, now, userId],
        );
      }

      this.logger.log(`Recorded last_login for user ${identifier} (${userId}) at ${now}`);
      return { success: true, lastLogin: now };
    } catch (err) {
      this.logger.error(`Error recording login for ${identifier}:`, err);
      return { success: false };
    }
  }
}
