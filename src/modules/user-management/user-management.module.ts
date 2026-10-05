import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KeycloakRole } from '../../database/entities/user-management/keycloak-role.entity';
import { Project } from '../../database/entities/setting-management/project.entity';
import { USER_MGMT_CONNECTION, SETTING_MGMT_CONNECTION } from '../../database/constants';
import { UserManagementService } from './user-management.service';
import { UserManagementController } from './user-management.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([KeycloakRole], USER_MGMT_CONNECTION),
    TypeOrmModule.forFeature([Project], SETTING_MGMT_CONNECTION),
  ],
  controllers: [UserManagementController],
  providers: [UserManagementService],
  exports: [UserManagementService],
})
export class UserManagementModule {}
