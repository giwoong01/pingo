import { Column, CreateDateColumn, Entity, Index, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { App } from './app.entity';
import { Instance } from './instance.entity';

export type RuleSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type RuleRunbook = {
  url?: string;
  steps?: string[];
};

export type RuleKind =
  | 'CUSTOM'
  | 'INSTANCE_DOWN'
  | 'HEAP_RATIO_HIGH'
  | 'GC_PAUSE_AVG_HIGH'
  | 'CPU_CORES_HIGH'
  | 'RSS_BYTES_HIGH'
  | 'HTTP_5XX_RATIO_HIGH'
  | 'HTTP_LATENCY_P95_HIGH'
  | 'HTTP_RPS_DROP'
  | 'SLO_BURN_RATE_HIGH';

@Entity({ name: 'rules' })
@Index(['workspaceId', 'appId', 'name'], { unique: true })
export class Rule {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', nullable: true })
  workspaceId!: string | null;

  @Column({ type: 'uuid', nullable: true })
  appId!: string | null;

  @ManyToOne(() => App, { onDelete: 'SET NULL', nullable: true })
  app!: App | null;

  @Column({ type: 'uuid', nullable: true })
  instanceId!: string | null;

  @ManyToOne(() => Instance, { onDelete: 'SET NULL', nullable: true })
  instance!: Instance | null;

  @Column({ type: 'varchar', length: 200 })
  name!: string;

  @Column({ type: 'varchar', length: 30, default: 'MEDIUM' })
  severity!: RuleSeverity;

  @Column({ type: 'varchar', length: 40, default: 'CUSTOM' })
  kind!: RuleKind;

  @Column({ type: 'text' })
  expr!: string;

  @Column({ type: 'int', default: 60 })
  intervalSeconds!: number;

  @Column({ type: 'int', default: 60 })
  forSeconds!: number;

  @Column({ type: 'int', default: 600 })
  cooldownSeconds!: number;

  @Column({ type: 'boolean', default: true })
  enabled!: boolean;

  @Column({ type: 'jsonb', nullable: true })
  runbook!: RuleRunbook | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
