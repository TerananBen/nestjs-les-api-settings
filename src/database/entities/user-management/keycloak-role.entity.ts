import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity({ name: 'keycloak_role', synchronize: false })
export class KeycloakRole {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description?: string;

  @Column({ type: 'boolean', name: 'client_role', default: false })
  client_role: boolean;

  @Column({ type: 'varchar', length: 36, nullable: true, name: 'realm_id' })
  realm_id?: string;

  @Column({ type: 'varchar', length: 36, nullable: true, name: 'client' })
  client?: string;
}
