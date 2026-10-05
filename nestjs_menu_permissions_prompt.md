# NestJS Multi-Database Service Prompt (Keycloak Auth & Menu Permissions)

คัดลอกข้อความด้านล่างนี้ทั้งหมด นำไปสั่ง AI หรือมอบให้ทีมนักพัฒนาเพื่อสร้างโปรเจกต์ NestJS ได้ทันที:

```markdown
คุณคือ Senior Backend Engineer ผู้เชี่ยวชาญด้าน NestJS, TypeScript, PostgreSQL (Multi-Database Architecture) และ Enterprise Security

เป้าหมาย:
สร้าง NestJS Backend Service เชื่อมต่อกับ PostgreSQL แบบ 2 Databases ที่มีอยู่แล้วในระบบ:
1. Database `user_management`: ฐานข้อมูลของ Keycloak ที่มีอยู่แล้ว (ทำหน้าที่ค้นหา `role_id` จาก `role_name` ที่ได้จาก Token)
2. Database `setting_management`: ฐานข้อมูลตั้งค่าระบบที่มีตารางและข้อมูลพร้อมใช้งานอยู่แล้ว 2 ตารางคือ `projects` และ `permissions`

> **ข้อกำหนดสำคัญด้านฐานข้อมูล (Critical Rule):**
> ฐานข้อมูล ตาราง (`projects`, `permissions`) และข้อมูลสิทธิ์เมนูถูกสร้างและบรรจุข้อมูลไว้ใน PostgreSQL เรียบร้อยแล้ว 
> - **ห้าม** รัน Migration สร้างตารางใหม่
> - **ห้าม** ทำ Database Seed หรือ Drop ตาราง
> - ต้องตั้งค่า TypeORM เป็น **`synchronize: false`** เท่านั้น โดยสร้าง Entity เพื่อแมปกับตารางที่มีอยู่จริงสำหรับ Query และ Update ข้อมูล

---

### 1. สถาปัตยกรรมและการเชื่อมต่อฐานข้อมูล (Multi-Database with TypeORM)
กำหนด Connection ใน NestJS แยกเป็น 2 ตัว:

1. **Connection: `USER_MGMT_CONNECTION` (Database: `user_management`)**
   - ชี้ไปยังฐานข้อมูลของ Keycloak ที่มีอยู่แล้ว
   - Entity/Table ที่ต้องเข้าถึง: ตาราง Role ของ Keycloak (เช่น `keycloak_role` หรือตารางที่มี `id` และ `name`)
   - หน้าที่: Read-only Query หา `role_id` โดยใช้เงื่อนไข `name = :role_name`

2. **Connection: `SETTING_MGMT_CONNECTION` (Database: `setting_management`)**
   - ชี้ไปยังฐานข้อมูลตั้งค่าระบบ (`synchronize: false`) ที่มี **2 ตารางพร้อมข้อมูลอยู่แล้ว**:
     
     **ตารางที่ 1: `projects` (มีข้อมูลโปรเจกต์อยู่แล้ว)**
     - `id`: VARCHAR(50) (Primary Key) เช่น 'project_a'
     - `name`: VARCHAR(150) (ชื่อโปรเจกต์)
     - `domain`: VARCHAR(255) (Nullable)
     - `logo`: TEXT
     - `app_icon`: TEXT
     - `color`: VARCHAR(50)
     - `created_at`, `updated_at`: timestamps

     **ตารางที่ 2: `permissions` (มีข้อมูลสิทธิ์ 16 เมนูบันทึกรอไว้แล้ว)**
     - `permission_id`: SERIAL (Primary Key)
     - `role_id`: VARCHAR(50) (รหัส Role ที่แมปได้จาก user_management DB)
     - `project_id`: VARCHAR(50) (Foreign Key อ้างอิง projects.id)
     - `menu_id`: VARCHAR(50) (รหัสเมนู เช่น '1', '2')
     - `menu_name`: VARCHAR(100) (ชื่อคีย์เมนู เช่น 'dashboard_group', 'dashboard_overview')
     - `readable`: CHAR(1) - '1' หรือ '0'
     - `writeable`: CHAR(1) - '1' หรือ '0'
     - `control`: CHAR(1) - '1' หรือ '0'
     - `updated_at`: timestamp
     - Unique Constraint: `(role_id, project_id, menu_id)`
     - Index: `idx_permissions_lookup (role_id, project_id)`

---

### 2. End-to-End Authentication & Permission Flow
เมื่อผู้ใช้ล็อกอินผ่าน Keycloak สำเร็จ:
1. Next.js ส่ง Request พร้อม Header:
   - `Authorization: Bearer <Keycloak_JWT_Token>`
   - `X-Project-Id: <current_project_id>` (เช่น 'project_a')
2. NestJS `JwtAuthGuard` ทำการแกะ Token:
   - ดึง `role_name` ออกจาก Token (เช่น จาก `realm_access.roles` หรือ `roles` claim)
3. **Step 1 (User Management DB)**: 
   - นำ `role_name` ไป Query ใน DB `user_management` เพื่อหา `role_id`
4. **Step 2 (Setting Management DB)**: 
   - นำ `role_id` ที่ได้ และ `project_id` จาก Header ไป Query ตาราง `permissions` ใน DB `setting_management`
5. ส่งผลลัพธ์ Array ของสิทธิ์เมนูกลับให้ Next.js แสดงผลบน Sidebar และควบคุมปุ่มต่างๆ

---

### 3. API Endpoints ที่ต้องพัฒนา

#### 3.1 Client Menu Permissions
- `GET /api/permissions/my-menus`
  - Guard: `JwtAuthGuard`
  - Header: `Authorization: Bearer <token>`, `X-Project-Id: <project_id>`
  - Logic: 
    1. แกะ `role_name` จาก Token
    2. ค้นหา `role_id` จาก DB `user_management`
    3. ดึงรายการจากตาราง `permissions` ใน DB `setting_management` โดยเลือกเฉพาะแถวที่ `readable = '1'`
  - Response: Array ของเมนูที่อนุญาตให้เข้าดู

#### 3.2 Admin Matrix (สำหรับหน้าจอ /setting-system/menu-settings)
- `GET /api/permissions/matrix`
  - Query: `?role_id=<role_id>&project_id=<project_id>`
  - Logic: ดึงรายการเมนูทั้งหมด 16 เมนู พร้อมสถานะ `readable`, `writeable`, `control` ของ Role และ Project นั้น
- `PUT /api/permissions/matrix`
  - Body:
    ```json
    {
      "role_id": "1",
      "project_id": "project_a",
      "permissions": [
        {
          "menu_id": "1",
          "readable": "1",
          "writeable": "0",
          "control": "0"
        }
      ]
    }
    ```
  - Logic: บันทึก (Upsert) ค่าสิทธิ์ลงตาราง `permissions` ใน DB `setting_management`

#### 3.3 Projects Management (CRUD บน DB `setting_management`)
- `GET /api/projects`: ดึงรายการโปรเจกต์ทั้งหมด
- `POST /api/projects`: สร้างโปรเจกต์ใหม่
- `PUT /api/projects/:id`: แก้ไขข้อมูลโปรเจกต์
- `DELETE /api/projects/:id`: ลบโปรเจกต์

---

### 4. รายการคีย์เมนู 16 เมนู (ที่บันทึกอยู่ในตาราง permissions แล้ว เพื่อใช้อ้างอิง Data Model ในโค้ด)
1. `dashboard_group` (ID: 1) - การใช้งานในโครงการ (`/dashboard/group`)
2. `dashboard_overview` (ID: 2) - แสดงผลภาพรวม (`/dashboard/overview`)
3. `control_streetlight` (ID: 3) - แบบรายโคม (`/setting-control/street-light`)
4. `control_group` (ID: 4) - จัดกลุ่มการทำงาน (`/setting-control/group-config`)
5. `control_schedule` (ID: 5) - การทำงานล่วงหน้า/ตารางเวลา (`/setting-control/schedule-settings`)
6. `map_disconnect` (ID: 6) - ตำแหน่งโคมขาดการติดต่อ (`/map/disconnect`)
7. `map_global` (ID: 7) - ตำแหน่งโคมไฟ (`/map/global`)
8. `map_changelamp` (ID: 8) - รายการติดตั้ง/เปลี่ยนโคม (`/map/change-lamp`)
9. `maintenance_dashboard` (ID: 9) - ภาพรวมการดูแลรักษา (`/maintenance/dashboard`)
10. `maintenance_request` (ID: 10) - แจ้งการซ่อมบำรุง (`/maintenance/config`)
11. `maintenance_list` (ID: 11) - รายการซ่อมบำรุง (`/maintenance/detail`)
12. `system_menu_permission` (ID: 12) - สิทธิ์การเข้าถึงเมนู (`/setting-system/menu-settings`)
13. `system_project` (ID: 13) - ตั้งค่าโปรเจกต์ (`/setting-system/project`)
14. `system_alert` (ID: 14) - การแจ้งเตือนความผิดปกติ (`/setting-system/alerts`)
15. `system_personal` (ID: 15) - จัดการบุคลากร (`/setting-system/personal`)
16. `system_device` (ID: 16) - ตั้งค่าอุปกรณ์ (`/dashboard/settings-device`)

---

### 5. สิ่งที่ต้องการให้ส่งมอบ
1. โครงสร้างโฟลเดอร์ Clean Architecture (Modules แยก Connection ชัดเจน: `UserManagementModule`, `SettingManagementModule`, `PermissionsModule`, `ProjectsModule`)
2. การตั้งค่า TypeORM สำหรับ 2 Databases ใน `app.module.ts` โดยใช้ `synchronize: false`
3. Entity สำหรับตาราง `projects` และ `permissions` ที่แมปตรงกับโครงสร้างจริงใน DB
4. ไฟล์ `.env.example` กำหนด Connection String แยก 2 ชุด (`USER_MGMT_DB_URL`, `SETTING_MGMT_DB_URL`)
5. Swagger Documentation (@nestjs/swagger) สำหรับทุก Endpoint
```
