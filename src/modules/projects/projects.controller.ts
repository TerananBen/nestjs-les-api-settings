import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { Project } from '../../database/entities/setting-management/project.entity';

@ApiTags('Projects')
@Controller('api/projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  @ApiOperation({ summary: 'ดึงรายการโปรเจกต์ทั้งหมด (List all projects)' })
  @ApiResponse({ status: 200, description: 'รายการโปรเจกต์ทั้งหมด', type: [Project] })
  async findAll(): Promise<Project[]> {
    return this.projectsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'ดึงข้อมูลโปรเจกต์ตาม ID (Get project by ID)' })
  @ApiParam({ name: 'id', description: 'รหัสโปรเจกต์', example: '7430e244-5f1b-453a-bff8-b90319a04283' })
  @ApiResponse({ status: 200, description: 'ข้อมูลโปรเจกต์', type: Project })
  @ApiResponse({ status: 404, description: 'ไม่พบโปรเจกต์' })
  async findOne(@Param('id') id: string): Promise<Project> {
    return this.projectsService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'สร้างโปรเจกต์ใหม่ (Create new project)' })
  @ApiResponse({ status: 201, description: 'สร้างโปรเจกต์สำเร็จ', type: Project })
  @ApiResponse({ status: 409, description: 'รหัสโปรเจกต์ซ้ำ' })
  async create(@Body() dto: CreateProjectDto): Promise<Project> {
    return this.projectsService.create(dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'แก้ไขข้อมูลโปรเจกต์ (Update project)' })
  @ApiParam({ name: 'id', description: 'รหัสโปรเจกต์', example: '7430e244-5f1b-453a-bff8-b90319a04283' })
  @ApiResponse({ status: 200, description: 'แก้ไขโปรเจกต์สำเร็จ', type: Project })
  @ApiResponse({ status: 404, description: 'ไม่พบโปรเจกต์' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateProjectDto,
  ): Promise<Project> {
    return this.projectsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'ลบโปรเจกต์ (Delete project)' })
  @ApiParam({ name: 'id', description: 'รหัสโปรเจกต์', example: '7430e244-5f1b-453a-bff8-b90319a04283' })
  @ApiResponse({ status: 200, description: 'ลบโปรเจกต์สำเร็จ' })
  @ApiResponse({ status: 404, description: 'ไม่พบโปรเจกต์' })
  async remove(@Param('id') id: string) {
    return this.projectsService.remove(id);
  }
}
