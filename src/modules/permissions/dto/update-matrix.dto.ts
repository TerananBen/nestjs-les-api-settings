import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';

export class PermissionItemDto {
  @ApiProperty({ description: 'รหัสเมนู (1-16) หรือชื่อคีย์เมนู', example: '1' })
  @IsNotEmpty()
  @IsString()
  menu_id: string;

  @ApiProperty({ description: 'ชื่อคีย์เมนู (Optional หากระบุ menu_id)', example: 'dashboard_group', required: false })
  @IsOptional()
  @IsString()
  menu_name?: string;

  @ApiProperty({ description: "สิทธิ์การเข้าดู ('1' หรือ '0')", example: '1', default: '0' })
  @IsNotEmpty()
  @IsString()
  readable: string;

  @ApiProperty({ description: "สิทธิ์การบันทึก/แก้ไข ('1' หรือ '0')", example: '0', default: '0' })
  @IsNotEmpty()
  @IsString()
  writable: string;

  @ApiProperty({ description: "สิทธิ์การควบคุม ('1' หรือ '0')", example: '0', default: '0' })
  @IsNotEmpty()
  @IsString()
  control: string;
}

export class UpdateMatrixDto {
  @ApiProperty({ description: 'รหัส Role (UUID หรือ string จาก Keycloak DB)', example: 'ce58d2ad-eed9-494b-8ba3-502f4087a041' })
  @IsNotEmpty()
  @IsString()
  role_id: string;

  @ApiProperty({ description: 'รหัสโครงการ (UUID หรือ string จาก projects)', example: '7430e244-5f1b-453a-bff8-b90319a04283' })
  @IsNotEmpty()
  @IsString()
  project_id: string;

  @ApiProperty({ description: 'รายการสิทธิ์ของแต่ละเมนู', type: [PermissionItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PermissionItemDto)
  permissions: PermissionItemDto[];
}
