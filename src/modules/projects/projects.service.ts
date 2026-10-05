import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { Project } from '../../database/entities/setting-management/project.entity';
import { SETTING_MGMT_CONNECTION } from '../../database/constants';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { PermissionsService } from '../permissions/permissions.service';
import { UserManagementService } from '../user-management/user-management.service';

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(
    @InjectRepository(Project, SETTING_MGMT_CONNECTION)
    private readonly projectRepository: Repository<Project>,
    private readonly permissionsService: PermissionsService,
    private readonly userManagementService: UserManagementService,
  ) {}

  /**
   * GET /api/projects: List all projects
   */
  async findAll(): Promise<Project[]> {
    return this.projectRepository.find({
      order: { create_timestamp: 'ASC' },
    });
  }

  private isValidUuid(id: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
  }

  /**
   * GET /api/projects/:id: Get project by ID
   */
  async findOne(id: string): Promise<Project> {
    if (!this.isValidUuid(id)) {
      throw new NotFoundException(`Project with ID '${id}' not found (invalid UUID format)`);
    }

    const project = await this.projectRepository.findOne({ where: { id } });
    if (!project) {
      throw new NotFoundException(`Project with ID '${id}' not found`);
    }
    return project;
  }

  /**
   * POST /api/projects: Create new project
   */
  async create(dto: CreateProjectDto, createdBy?: string): Promise<Project> {
    const projectId = dto.id && this.isValidUuid(dto.id) ? dto.id : randomUUID();

    const existing = await this.projectRepository.findOne({
      where: { id: projectId },
    });

    if (existing) {
      throw new ConflictException(`Project with ID '${projectId}' already exists`);
    }

    const defaultCode = (dto.domain?.split('.')[0] || dto.name).toLowerCase().replace(/[\s_]+/g, '-');
    const project = this.projectRepository.create({
      id: projectId,
      name: dto.name,
      domain: dto.domain || '',
      code: dto.code || defaultCode,
      sidebar_logo: dto.sidebar_logo || dto.logo || '/logo-le.svg',
      favicon_logo: dto.favicon_logo || dto.app_icon || '/logo-le.svg',
      color: dto.color || '#2563eb',
      enable_login_otp: dto.enable_login_otp ?? dto.enableLoginOtp ?? false,
      status: dto.status ?? true,
      create_by: createdBy,
      update_by: createdBy,
    });

    const savedProject = await this.projectRepository.save(project);

    // Auto-provision Keycloak Client & standard Client Roles
    const clientSlug = (savedProject.code || savedProject.domain?.split('.')[0] || savedProject.name)
      .toLowerCase()
      .replace(/[\s_]+/g, '-');
    await this.userManagementService.provisionProjectClient(clientSlug, savedProject.name);

    // Initialize default system settings permissions for AdminManagement
    await this.permissionsService.initDefaultPermissions(savedProject.id, undefined, createdBy);

    return savedProject;
  }

  /**
   * PUT /api/projects/:id: Update project
   */
  async update(
    id: string,
    dto: UpdateProjectDto,
    updatedBy?: string,
  ): Promise<Project> {
    const project = await this.findOne(id);

    if (dto.name !== undefined) project.name = dto.name;
    if (dto.domain !== undefined) project.domain = dto.domain;
    if (dto.code !== undefined) project.code = dto.code;
    if (dto.sidebar_logo !== undefined || dto.logo !== undefined) {
      project.sidebar_logo = dto.sidebar_logo || dto.logo || '/logo-le.svg';
    }
    if (dto.favicon_logo !== undefined || dto.app_icon !== undefined) {
      project.favicon_logo = dto.favicon_logo || dto.app_icon || '/logo-le.svg';
    }
    if (dto.color !== undefined) project.color = dto.color;
    if (dto.enable_login_otp !== undefined || dto.enableLoginOtp !== undefined) {
      project.enable_login_otp = Boolean(dto.enable_login_otp ?? dto.enableLoginOtp);
    }
    if (dto.status !== undefined) project.status = dto.status;

    project.update_by = updatedBy;
    project.update_timestamp = new Date();

    return this.projectRepository.save(project);
  }

  /**
   * DELETE /api/projects/:id: Delete project
   */
  async remove(id: string): Promise<{ success: boolean; message: string }> {
    const project = await this.findOne(id);
    await this.projectRepository.remove(project);

    return {
      success: true,
      message: `Project with ID '${id}' successfully deleted`,
    };
  }
}
