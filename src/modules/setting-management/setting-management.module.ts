import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Project } from '../../database/entities/setting-management/project.entity';
import { Permission } from '../../database/entities/setting-management/permission.entity';
import { SETTING_MGMT_CONNECTION } from '../../database/constants';

@Module({
  imports: [
    TypeOrmModule.forFeature([Project, Permission], SETTING_MGMT_CONNECTION),
  ],
  exports: [TypeOrmModule],
})
export class SettingManagementModule {}
