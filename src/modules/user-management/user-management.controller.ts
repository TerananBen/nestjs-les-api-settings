import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { UserManagementService } from './user-management.service';
import {
  KeycloakUserDto,
  CreateUserDto,
  UpdateUserDto,
  UpdateUserStatusDto,
} from './dto/user.dto';

@ApiTags('User Management')
@Controller('api/users')
export class UserManagementController {
  constructor(private readonly userManagementService: UserManagementService) {}

  @Get()
  @ApiOperation({
    summary: 'ดึงรายชื่อผู้ใช้ทั้งหมดจาก Keycloak (Realm les)',
    description: 'ดึงข้อมูลผู้ใช้ทั้งหมด พร้อม Role และรายการโครงการ (projectID) ที่ได้รับมอบหมาย สามารถกรองตาม project_id',
  })
  @ApiQuery({
    name: 'project_id',
    description: 'รหัสโครงการ (UUID หรือ Client ID เช่น project-a)',
    required: false,
  })
  @ApiResponse({
    status: 200,
    description: 'รายการผู้ใช้ Keycloak',
    type: [KeycloakUserDto],
  })
  async getUsers(@Query('project_id') projectId?: string): Promise<KeycloakUserDto[]> {
    return this.userManagementService.getUsers(projectId);
  }

  @Get('roles')
  @ApiOperation({
    summary: 'ดึงรายการ Roles สำหรับโครงการหรือ Realm',
    description: 'ดึง Client Roles ของ Client ประจำโครงการ หรือ Realm Roles หากไม่ได้ระบุโครงการ',
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
    return this.userManagementService.getApplicationRoles(projectId);
  }

  @Get('check/:username')
  @ApiOperation({
    summary: 'ตรวจสอบว่า Username มีอยู่แล้วหรือไม่',
    description: 'เช็คใน Keycloak Realm les',
  })
  @ApiResponse({
    status: 200,
    description: 'ผลการตรวจสอบ username',
  })
  async checkUsername(@Param('username') username: string): Promise<{ exists: boolean }> {
    return this.userManagementService.checkUsername(username);
  }

  @Get('verify-status')
  @ApiOperation({
    summary: 'ตรวจสอบสถานะ email_verified ของผู้ใช้',
    description: 'เช็คใน Keycloak Realm les ด้วย email หรือ username',
  })
  @ApiResponse({
    status: 200,
    description: 'ผลการตรวจสอบ email_verified',
  })
  async getEmailVerifyStatus(
    @Query('email') email?: string,
    @Query('username') username?: string,
  ): Promise<{ verified: boolean }> {
    return this.userManagementService.checkEmailVerified(email, username);
  }

  @Get('check-reset-user')
  @ApiOperation({
    summary: 'ตรวจสอบผู้ใช้ก่อนส่งอีเมลรีเซ็ตรหัสผ่าน (Case 1: ไม่มี User, Case 2: ไม่มี Email)',
    description: 'เช็คใน Keycloak Realm les ด้วย username หรือ email',
  })
  @ApiQuery({
    name: 'query',
    description: 'Username หรือ Email ของผู้ใช้',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'ผลการตรวจสอบสถานะผู้ใช้สำหรับรีเซ็ตรหัสผ่าน',
  })
  async checkResetUser(
    @Query('query') query: string,
  ): Promise<{
    exists: boolean;
    hasEmail: boolean;
    email?: string | null;
    status: 'USER_NOT_FOUND' | 'NO_EMAIL' | 'VALID';
  }> {
    return this.userManagementService.checkResetUser(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'ดึงข้อมูลผู้ใช้รายบุคคลตาม ID',
  })
  @ApiResponse({
    status: 200,
    description: 'ข้อมูลผู้ใช้',
    type: KeycloakUserDto,
  })
  async getUserById(@Param('id') id: string): Promise<KeycloakUserDto> {
    return this.userManagementService.getUserById(id);
  }

  @Post()
  @ApiOperation({
    summary: 'สร้างผู้ใช้ใหม่ใน Keycloak',
    description: 'สร้างผู้ใช้ใหม่พร้อมกำหนดรหัสผ่าน Role และโครงการ',
  })
  @ApiResponse({
    status: 201,
    description: 'สร้างผู้ใช้สำเร็จ',
  })
  async createUser(@Body() dto: CreateUserDto): Promise<{ success: boolean; id: string }> {
    return this.userManagementService.createUser(dto);
  }

  @Put(':id')
  @ApiOperation({
    summary: 'แก้ไขข้อมูลผู้ใช้ใน Keycloak',
    description: 'แก้ไขชื่อ-นามสกุล อีเมล รหัสผ่าน Role และโครงการ',
  })
  @ApiResponse({
    status: 200,
    description: 'แก้ไขสำเร็จ',
  })
  async updateUser(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ): Promise<{ success: boolean }> {
    return this.userManagementService.updateUser(id, dto);
  }

  @Patch(':id/status')
  @ApiOperation({
    summary: 'เปิด/ปิดการใช้งานผู้ใช้ (Toggle Enabled Status)',
  })
  @ApiResponse({
    status: 200,
    description: 'ปรับสถานะสำเร็จ',
  })
  async updateUserStatus(
    @Param('id') id: string,
    @Body() dto: UpdateUserStatusDto,
  ): Promise<{ success: boolean }> {
    return this.userManagementService.updateUserStatus(id, dto.enabled);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'ลบผู้ใช้ออกจาก Keycloak',
  })
  @ApiResponse({
    status: 200,
    description: 'ลบผู้ใช้สำเร็จ',
  })
  async deleteUser(@Param('id') id: string): Promise<{ success: boolean }> {
    return this.userManagementService.deleteUser(id);
  }

  @Post(':id/login')
  @ApiOperation({
    summary: 'บันทึกเวลาเข้าสู่ระบบล่าสุด (Record Last Login Timestamp)',
    description: 'บันทึกวันและเวลาเข้าสู่ระบบล่าสุดของผู้ใช้ใน Keycloak user_attribute',
  })
  @ApiResponse({
    status: 200,
    description: 'บันทึกเวลาสำเร็จ',
  })
  async recordLogin(
    @Param('id') id: string,
  ): Promise<{ success: boolean; lastLogin?: string }> {
    return this.userManagementService.recordLogin(id);
  }
}
