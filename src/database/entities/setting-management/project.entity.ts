import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'projects', synchronize: false })
export class Project {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text', nullable: true })
  domain?: string;

  @Column({ type: 'text', name: 'sidebar_logo', nullable: true })
  sidebar_logo?: string;

  @Column({ type: 'text', name: 'favicon_logo', nullable: true })
  favicon_logo?: string;

  @Column({ type: 'text', nullable: true })
  color?: string;

  @Column({ type: 'text', nullable: true })
  code?: string;

  @Column({ type: 'boolean', name: 'enable_login_otp', default: false })
  enable_login_otp: boolean;

  @Column({ type: 'boolean', default: true })
  status: boolean;

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

  // Compatibility aliases for prompt / frontend contracts
  get enableLoginOtp(): boolean {
    return this.enable_login_otp;
  }
  set enableLoginOtp(value: boolean) {
    this.enable_login_otp = value;
  }

  get logo(): string | undefined {
    return this.sidebar_logo;
  }
  set logo(value: string | undefined) {
    this.sidebar_logo = value;
  }

  get app_icon(): string | undefined {
    return this.favicon_logo;
  }
  set app_icon(value: string | undefined) {
    this.favicon_logo = value;
  }

  get created_at(): Date {
    return this.create_timestamp;
  }

  get updated_at(): Date {
    return this.update_timestamp;
  }
}
