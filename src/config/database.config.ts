import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { KeycloakRole } from '../database/entities/user-management/keycloak-role.entity';
import { Project } from '../database/entities/setting-management/project.entity';
import { Permission } from '../database/entities/setting-management/permission.entity';
import { USER_MGMT_CONNECTION, SETTING_MGMT_CONNECTION } from '../database/constants';

export const getUserMgmtDbConfig = (): TypeOrmModuleOptions => ({
  name: USER_MGMT_CONNECTION,
  type: 'postgres',
  url: process.env.USER_MGMT_DB_URL,
  entities: [KeycloakRole],
  synchronize: false, // CRITICAL: Do NOT alter or sync existing database
  logging: process.env.NODE_ENV === 'development',
});

export const getSettingMgmtDbConfig = (): TypeOrmModuleOptions => ({
  name: SETTING_MGMT_CONNECTION,
  type: 'postgres',
  url: process.env.SETTING_MGMT_DB_URL,
  entities: [Project, Permission],
  synchronize: false, // CRITICAL: Do NOT alter or sync existing database
  logging: process.env.NODE_ENV === 'development',
});
