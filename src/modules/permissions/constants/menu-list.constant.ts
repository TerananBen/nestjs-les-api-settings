export interface SystemMenuDefinition {
  id: string;
  name: string;
  label: string;
  path: string;
}

export const SYSTEM_MENUS: SystemMenuDefinition[] = [
  { id: '1', name: 'dashboard_group', label: 'การใช้งานในโครงการ', path: '/dashboard/group' },
  { id: '2', name: 'dashboard_overview', label: 'แสดงผลภาพรวม', path: '/dashboard/overview' },
  { id: '3', name: 'control_streetlight', label: 'แบบรายโคม', path: '/setting-control/street-light' },
  { id: '4', name: 'control_group', label: 'จัดกลุ่มการทำงาน', path: '/setting-control/group-config' },
  { id: '5', name: 'control_schedule', label: 'การทำงานล่วงหน้า/ตารางเวลา', path: '/setting-control/schedule-settings' },
  { id: '6', name: 'map_disconnect', label: 'ตำแหน่งโคมขาดการติดต่อ', path: '/map/disconnect' },
  { id: '7', name: 'map_global', label: 'ตำแหน่งโคมไฟ', path: '/map/global' },
  { id: '8', name: 'map_changelamp', label: 'รายการติดตั้ง/เปลี่ยนโคม', path: '/map/change-lamp' },
  { id: '9', name: 'maintenance_dashboard', label: 'ภาพรวมการดูแลรักษา', path: '/maintenance/dashboard' },
  { id: '10', name: 'maintenance_request', label: 'แจ้งการซ่อมบำรุง', path: '/maintenance/config' },
  { id: '11', name: 'maintenance_list', label: 'รายการซ่อมบำรุง', path: '/maintenance/detail' },
  { id: '12', name: 'system_menu_permission', label: 'สิทธิ์การเข้าถึงเมนู', path: '/setting-system/menu-settings' },
  { id: '13', name: 'system_project', label: 'ตั้งค่าโปรเจกต์', path: '/setting-system/project' },
  { id: '14', name: 'system_alert', label: 'การแจ้งเตือนความผิดปกติ', path: '/setting-system/alerts' },
  { id: '15', name: 'system_personal', label: 'จัดการบุคลากร', path: '/setting-system/personal' },
  { id: '16', name: 'system_device', label: 'ตั้งค่าอุปกรณ์', path: '/dashboard/settings-device' },
];

export const SYSTEM_MENU_MAP = new Map<string, SystemMenuDefinition>(
  SYSTEM_MENUS.map((menu) => [menu.id, menu]),
);
