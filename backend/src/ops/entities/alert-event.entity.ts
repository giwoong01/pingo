import { Column, CreateDateColumn, Entity, Index, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Rule } from './rule.entity';
import { App } from './app.entity';

export type AlertStatus = 'FIRING' | 'RESOLVED' | 'DISABLED' | 'ENABLED' | 'NO_DATA' | 'DATASOURCE_ERROR';

@Entity({ name: 'alert_events' })
@Index(['workspaceId', 'ruleId', 'status', 'startedAt'])
export class AlertEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', nullable: true })
  workspaceId!: string | null;

  @Column({ type: 'uuid' })
  ruleId!: string;

  @ManyToOne(() => Rule, { onDelete: 'CASCADE' })
  rule!: Rule;

  @Column({ type: 'uuid', nullable: true })
  appId!: string | null;

  @ManyToOne(() => App, { onDelete: 'SET NULL', nullable: true })
  app!: App | null;

  @Column({ type: 'varchar', length: 16 })
  status!: AlertStatus;

  @Column({ type: 'timestamptz' })
  startedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  endedAt!: Date | null;

  @Column({ type: 'double precision', nullable: true })
  value!: number | null;

  @Column({ type: 'jsonb', nullable: true })
  snapshot!: any | null;

  @Column({ type: 'jsonb', nullable: true })
  aiReport!: any | null;

  @CreateDateColumn()
  createdAt!: Date;
}
