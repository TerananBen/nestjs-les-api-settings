import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'permissions', synchronize: false })
export class Permission {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'id' })
  id: number;

  @Column({ type: 'text', name: 'role_id' })
  role_id: string;

  @Column({ type: 'uuid', name: 'project_id' })
  project_id: string;

  @Column({ type: 'text', name: 'menu_name' })
  menu_name: string;

  @Column({ type: 'text', default: '0' })
  readable: string;

  @Column({ type: 'text', default: '0' })
  writable: string;

  @Column({ type: 'text', default: '0' })
  control: string;

  @Column({ type: 'text', name: 'create_by', nullable: true })
  create_by?: string;

  @Column({ type: 'text', name: 'update_by', nullable: true })
  update_by?: string;

  @CreateDateColumn({
    type: 'timestamp with time zone',
    name: 'create_timestamp',
    default: () => 'CURRENT_TIMESTAMP',
  })
  create_timestamp: Date;

  @UpdateDateColumn({
    type: 'timestamp with time zone',
    name: 'update_timestamp',
    default: () => 'CURRENT_TIMESTAMP',
  })
  update_timestamp: Date;

  // Compatibility aliases
  get permission_id(): number {
    return Number(this.id);
  }

  get updated_at(): Date {
    return this.update_timestamp;
  }
}
