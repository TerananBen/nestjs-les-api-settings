import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Permission } from '../../database/entities/setting-management/permission.entity';
import { SETTING_MGMT_CONNECTION } from '../../database/constants';
import { UserManagementModule } from '../user-management/user-management.module';
import { PermissionsService } from './permissions.service';
import { PermissionsController } from './permissions.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Permission], SETTING_MGMT_CONNECTION),
    UserManagementModule,
  ],
  controllers: [PermissionsController],
  providers: [PermissionsService],
  exports: [PermissionsService],
})
export class PermissionsModule {}
