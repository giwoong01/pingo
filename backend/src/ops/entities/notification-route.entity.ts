import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { RuleSeverity } from './rule.entity';

@Entity({ name: 'notification_routes' })
@Index(['workspaceId', 'name'], { unique: true })
export class NotificationRoute {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', nullable: true })
  workspaceId!: string | null;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'boolean', default: true })
  enabled!: boolean;

  @Column({ type: 'int', default: 100 })
  priority!: number;

  @Column({ type: 'uuid', nullable: true })
  appId!: string | null;

  @Column({ type: 'uuid', nullable: true })
  instanceId!: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  severity!: RuleSeverity | null;

  @Column({ type: 'jsonb', nullable: true })
  webhookIds!: string[] | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

