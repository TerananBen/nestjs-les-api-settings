import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Project } from '../../database/entities/setting-management/project.entity';
import { SETTING_MGMT_CONNECTION } from '../../database/constants';
import { ProjectsService } from './projects.service';
import { ProjectsController } from './projects.controller';

import { PermissionsModule } from '../permissions/permissions.module';
import { UserManagementModule } from '../user-management/user-management.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Project], SETTING_MGMT_CONNECTION),
    PermissionsModule,
    UserManagementModule,
  ],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
