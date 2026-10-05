import {
  Controller,
  Get,
  Put,
  Body,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiHeader,
  ApiQuery,
} from '@nestjs/swagger';
import { PermissionsService } from './permissions.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, ProjectId } from '../auth/decorators/current-user.decorator';
import { KeycloakUserPayload } from '../auth/strategies/jwt.strategy';
import {
  MenuPermissionResponseDto,
  PermissionMatrixResponseDto,
} from './dto/menu-permission-response.dto';
import { UpdateMatrixDto } from './dto/update-matrix.dto';

@ApiTags('Permissions')
@Controller('api/permissions')
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  /**
   * 3.1 Client Menu Permissions
   */
  @Get('my-menus')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'ดึงสิทธิ์เมนูที่อนุญาตสำหรับผู้ใช้ปัจจุบัน (Client Menu Permissions)',
    description:
      'แกะ role_name จาก Token -> ค้นหา role_id ใน user_management DB -> ดึงสิทธิ์ที่ readable=1 จาก setting_management DB',
  })
  @ApiHeader({
    name: 'X-Project-Id',
    description: 'รหัสโปรเจกต์ (UUID หรือ ID เช่น project_a)',
    required: false,
  })
  @ApiResponse({
    status: 200,
    description: 'รายการเมนูที่อนุญาตให้เข้าดู',
    type: [MenuPermissionResponseDto],
  })
  async getMyMenus(
    @CurrentUser() user: KeycloakUserPayload,
    @ProjectId() projectId: string,
  ): Promise<MenuPermissionResponseDto[]> {
    if (!projectId) {
      throw new BadRequestException(
        'Missing Project ID. Please provide header X-Project-Id or project_id in token.',
      );
    }

    return this.permissionsService.getMyMenus(user.roles, projectId);
  }

  /**
   * 3.2 Admin Matrix (ดึงตารางสิทธิ์ 16 เมนู)
   */
  @Get('matrix')
  @ApiOperation({
    summary: 'ดึงเมทริกซ์สิทธิ์ 16 เมนู สำหรับหน้าจอจัดการสิทธิ์ (Admin Matrix)',
    description:
      'ดึงรายการเมนูทั้งหมด 16 เมนู พร้อมสถานะ readable, writable, control ของ Role และ Project นั้น',
  })
  @ApiQuery({
    name: 'role_id',
    description: 'รหัส Role (UUID หรือ ID ใน keycloak_role)',
    example: 'ce58d2ad-eed9-494b-8ba3-502f4087a041',
  })
  @ApiQuery({
    name: 'project_id',
    description: 'รหัสโครงการ (UUID หรือ ID ใน projects)',
    example: '7430e244-5f1b-453a-bff8-b90319a04283',
  })
  @ApiResponse({
    status: 200,
    description: 'เมทริกซ์สิทธิ์เมนู',
    type: PermissionMatrixResponseDto,
  })
  async getMatrix(
    @Query('role_id') roleId: string,
    @Query('project_id') projectId: string,
  ): Promise<PermissionMatrixResponseDto> {
    if (!roleId || !projectId) {
      throw new BadRequestException('Query parameters role_id and project_id are required');
    }

    return this.permissionsService.getMatrix(roleId, projectId);
  }

  /**
   * 3.2 Admin Matrix (บันทึกสิทธิ์)
   */
  @Put('matrix')
  @ApiOperation({
    summary: 'บันทึก/อัปเดตสิทธิ์เมนู (Upsert Permissions Matrix)',
    description: 'บันทึก (Upsert) ค่าสิทธิ์ลงตาราง permissions ใน setting_management DB',
  })
  @ApiResponse({
    status: 200,
    description: 'บันทึกสำเร็จ',
  })
  async updateMatrix(
    @Body() dto: UpdateMatrixDto,
  ) {
    return this.permissionsService.updateMatrix(dto);
  }

  /**
   * 3.3 List Keycloak Application Roles for Dropdown
   */
  @Get('roles')
  @ApiOperation({
    summary: 'ดึงรายการ Keycloak Application Roles',
    description: 'ดึงรายการ Role ทั้งหมดจาก Keycloak สำหรับ Dropdown เลือก Role ในหน้า Menu Settings โดยสามารถแยกตาม Project ID หรือ Client ID',
  })
  @ApiQuery({
    name: 'project_id',
    description: 'รหัสโครงการ (UUID หรือ Client ID เช่น project-a)',
    required: false,
  })
  @ApiResponse({
    status: 200,
    description: 'รายการ Role ทั้งหมด',
  })
  async getRoles(@Query('project_id') projectId?: string): Promise<{ id: string; name: string; code: string }[]> {
    return this.permissionsService.getRoles(projectId);
  }
}
