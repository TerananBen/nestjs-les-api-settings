import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateProjectDto {
  @ApiPropertyOptional({ description: 'ชื่อโปรเจกต์', example: 'โครงการเทศบาลปรับปรุง' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'รหัสโค้ดโปรเจกต์ เช่น project-a', example: 'project-a' })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({ description: 'โดเมนเฉพาะของโปรเจกต์', example: 'city-c.lighting.com' })
  @IsOptional()
  @IsString()
  domain?: string;

  @ApiPropertyOptional({ description: 'URL โลโก้แถบด้านข้าง (Sidebar Logo)', example: '/logos/project_c_v2.svg' })
  @IsOptional()
  @IsString()
  sidebar_logo?: string;

  @ApiPropertyOptional({ description: 'URL โลโก้ (Alias สำหรับ sidebar_logo)', example: '/logos/project_c_v2.svg' })
  @IsOptional()
  @IsString()
  logo?: string;

  @ApiPropertyOptional({ description: 'URL ไอคอนแอปพลิเคชัน (Favicon Logo)', example: '/icons/project_c_v2.svg' })
  @IsOptional()
  @IsString()
  favicon_logo?: string;

  @ApiPropertyOptional({ description: 'URL ไอคอนแอป (Alias สำหรับ favicon_logo)', example: '/icons/project_c_v2.svg' })
  @IsOptional()
  @IsString()
  app_icon?: string;

  @ApiPropertyOptional({ description: 'รหัสสีประจำโปรเจกต์', example: '#059669' })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional({ description: 'เปิดใช้งาน 2FA Email OTP สำหรับเข้าสู่ระบบ', example: false })
  @IsOptional()
  @IsBoolean()
  enable_login_otp?: boolean;

  @ApiPropertyOptional({ description: 'Alias สำหรับ enable_login_otp', example: false })
  @IsOptional()
  @IsBoolean()
  enableLoginOtp?: boolean;

  @ApiPropertyOptional({ description: 'สถานะการใช้งานโครงการ', example: true })
  @IsOptional()
  @IsBoolean()
  status?: boolean;
}
