import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class MenuPermissionResponseDto {
  @ApiProperty({ description: 'รหัสเมนู (1-16)', example: '1' })
  menu_id: string;

  @ApiProperty({ description: 'ชื่อคีย์เมนู', example: 'dashboard_group' })
  menu_name: string;

  @ApiProperty({ description: 'ป้ายชื่อเมนูภาษาไทย', example: 'การใช้งานในโครงการ' })
  label: string;

  @ApiProperty({ description: 'เส้นทางเมนู (Route path)', example: '/dashboard/group' })
  path: string;

  @ApiProperty({ description: "สิทธิ์การเข้าดู ('1' หรือ '0')", example: '1' })
  readable: string;

  @ApiProperty({ description: "สิทธิ์การบันทึก/แก้ไข ('1' หรือ '0')", example: '1' })
  writable: string;

  @ApiProperty({ description: "สิทธิ์การควบคุม ('1' หรือ '0')", example: '1' })
  control: string;
}

export class PermissionMatrixResponseDto {
  @ApiProperty({ description: 'รหัส Role', example: 'ce58d2ad-eed9-494b-8ba3-502f4087a041' })
  role_id: string;

  @ApiProperty({ description: 'รหัสโครงการ', example: '7430e244-5f1b-453a-bff8-b90319a04283' })
  project_id: string;

  @ApiProperty({ description: 'รายการเมนูทั้ง 16 รายการพร้อมสิทธิ์', type: [MenuPermissionResponseDto] })
  menus: MenuPermissionResponseDto[];
}
