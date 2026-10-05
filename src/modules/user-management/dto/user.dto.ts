import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsArray,
} from 'class-validator';

export class ProjectRoleDto {
  @ApiProperty({ description: 'Project UUID or Code' })
  @IsNotEmpty()
  @IsString()
  projectId: string;

  @ApiProperty({ description: 'Keycloak Role UUID or Name' })
  @IsNotEmpty()
  @IsString()
  roleId: string;
}

export class KeycloakUserDto {
  @ApiProperty({ description: 'Keycloak User UUID' })
  id: string;

  @ApiProperty({ description: 'Username' })
  username: string;

  @ApiPropertyOptional({ description: 'First name' })
  firstName?: string;

  @ApiPropertyOptional({ description: 'Last name' })
  lastName?: string;

  @ApiPropertyOptional({ description: 'Email' })
  email?: string;

  @ApiProperty({ description: 'Enabled status' })
  enabled: boolean;

  @ApiPropertyOptional({ description: 'Keycloak Role UUID' })
  roleId?: string;

  @ApiPropertyOptional({ description: 'Role Name' })
  roleName?: string;

  @ApiPropertyOptional({ description: 'Assigned Project IDs', type: [String] })
  projectIds?: string[];

  @ApiPropertyOptional({ description: 'Roles assigned per project', type: [ProjectRoleDto] })
  projectRoles?: { projectId: string; projectName?: string; roleId: string; roleName: string }[];

  @ApiPropertyOptional({ description: 'Creation Timestamp (ms)' })
  createdTimestamp?: string;

  @ApiPropertyOptional({ description: 'Last login formatted timestamp' })
  lastLogin?: string;
}

export class CreateUserDto {
  @ApiProperty({ description: 'Username' })
  @IsNotEmpty()
  @IsString()
  username: string;

  @ApiProperty({ description: 'First name' })
  @IsNotEmpty()
  @IsString()
  firstName: string;

  @ApiProperty({ description: 'Last name' })
  @IsNotEmpty()
  @IsString()
  lastName: string;

  @ApiProperty({ description: 'Email address' })
  @IsNotEmpty()
  @IsString()
  email: string;

  @ApiProperty({ description: 'Password' })
  @IsNotEmpty()
  @IsString()
  password: string;

  @ApiPropertyOptional({ description: 'Primary Keycloak Role UUID or Name' })
  @IsOptional()
  @IsString()
  roleId?: string;

  @ApiPropertyOptional({ description: 'Project UUIDs', type: [String] })
  @IsOptional()
  @IsArray()
  projectIds?: string[];

  @ApiPropertyOptional({ description: 'Roles assigned per project', type: [ProjectRoleDto] })
  @IsOptional()
  @IsArray()
  projectRoles?: ProjectRoleDto[];

  @ApiPropertyOptional({ description: 'Initial enabled status', default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class UpdateUserDto {
  @ApiPropertyOptional({ description: 'First name' })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional({ description: 'Last name' })
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional({ description: 'Email address' })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({ description: 'Password (leave empty if not changing)' })
  @IsOptional()
  @IsString()
  password?: string;

  @ApiPropertyOptional({ description: 'Keycloak Role UUID or Name' })
  @IsOptional()
  @IsString()
  roleId?: string;

  @ApiPropertyOptional({ description: 'Project UUIDs', type: [String] })
  @IsOptional()
  @IsArray()
  projectIds?: string[];

  @ApiPropertyOptional({ description: 'Roles assigned per project', type: [ProjectRoleDto] })
  @IsOptional()
  @IsArray()
  projectRoles?: ProjectRoleDto[];

  @ApiPropertyOptional({ description: 'Enabled status' })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class UpdateUserStatusDto {
  @ApiProperty({ description: 'Enabled status' })
  @IsBoolean()
  enabled: boolean;
}
