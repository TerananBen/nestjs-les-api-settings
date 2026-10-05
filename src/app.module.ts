import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { USER_MGMT_CONNECTION, SETTING_MGMT_CONNECTION } from './database/constants';
import { getUserMgmtDbConfig, getSettingMgmtDbConfig } from './config/database.config';
import { UserManagementModule } from './modules/user-management/user-management.module';
import { SettingManagementModule } from './modules/setting-management/setting-management.module';
import { AuthModule } from './modules/auth/auth.module';
import { PermissionsModule } from './modules/permissions/permissions.module';
import { ProjectsModule } from './modules/projects/projects.module';

@Module({
  imports: [
    // Global environment configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.example'],
    }),

    // Multi-Database Connection 1: user_management (Keycloak Database)
    TypeOrmModule.forRootAsync({
      name: USER_MGMT_CONNECTION,
      useFactory: () => getUserMgmtDbConfig(),
    }),

    // Multi-Database Connection 2: setting_management (Settings Database)
    TypeOrmModule.forRootAsync({
      name: SETTING_MGMT_CONNECTION,
      useFactory: () => getSettingMgmtDbConfig(),
    }),

    // Business Modules
    UserManagementModule,
    SettingManagementModule,
    AuthModule,
    PermissionsModule,
    ProjectsModule,
  ],
})
export class AppModule {}
