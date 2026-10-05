import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateProjectDto {
  @ApiPropertyOptional({
    description: 'รหัสโปรเจกต์ (UUID หรือข้อความระบุ เช่น project_c, หากไม่ระบุจะถูกสร้างอัตโนมัติ)',
    example: 'project_c',
  })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiPropertyOptional({ description: 'รหัสโค้ดโปรเจกต์ เช่น project-a', example: 'project-a' })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiProperty({ description: 'ชื่อโปรเจกต์', example: 'โครงการทดสอบเทศบาล' })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: 'โดเมนเฉพาะของโปรเจกต์', example: 'city-c.lighting.com' })
  @IsOptional()
  @IsString()
  domain?: string;

  @ApiPropertyOptional({ description: 'URL โลโก้แถบด้านข้าง (Sidebar Logo)', example: '/logos/project_c.svg' })
  @IsOptional()
  @IsString()
  sidebar_logo?: string;

  @ApiPropertyOptional({ description: 'URL โลโก้ (Alias สำหรับ sidebar_logo)', example: '/logos/project_c.svg' })
  @IsOptional()
  @IsString()
  logo?: string;

  @ApiPropertyOptional({ description: 'URL ไอคอนแอปพลิเคชัน (Favicon Logo)', example: '/icons/project_c.svg' })
  @IsOptional()
  @IsString()
  favicon_logo?: string;

  @ApiPropertyOptional({ description: 'URL ไอคอนแอป (Alias สำหรับ favicon_logo)', example: '/icons/project_c.svg' })
  @IsOptional()
  @IsString()
  app_icon?: string;

  @ApiPropertyOptional({ description: 'รหัสสีประจำโปรเจกต์ (HEX หรือ Preset)', example: '#2563eb' })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional({ description: 'เปิดใช้งาน 2FA Email OTP สำหรับเข้าสู่ระบบ', example: false, default: false })
  @IsOptional()
  @IsBoolean()
  enable_login_otp?: boolean;

  @ApiPropertyOptional({ description: 'Alias สำหรับ enable_login_otp', example: false })
  @IsOptional()
  @IsBoolean()
  enableLoginOtp?: boolean;

  @ApiPropertyOptional({ description: 'สถานะการใช้งานโครงการ', example: true, default: true })
  @IsOptional()
  @IsBoolean()
  status?: boolean;
}
