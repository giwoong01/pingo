import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { RuleSeverity } from './rule.entity';

@Entity({ name: 'notification_silences' })
@Index(['workspaceId', 'name'], { unique: true })
export class NotificationSilence {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', nullable: true })
  workspaceId!: string | null;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'boolean', default: true })
  enabled!: boolean;

  @Column({ type: 'uuid', nullable: true })
  appId!: string | null;

  @Column({ type: 'uuid', nullable: true })
  instanceId!: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  severity!: RuleSeverity | null;

  @Column({ type: 'varchar', length: 64, default: 'UTC' })
  timezone!: string;

  @Column({ type: 'jsonb', nullable: true })
  daysOfWeek!: number[] | null;

  @Column({ type: 'varchar', length: 5 })
  startTime!: string;

  @Column({ type: 'varchar', length: 5 })
  endTime!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
