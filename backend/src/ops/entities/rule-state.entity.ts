import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type RuleRunState = 'OK' | 'PENDING' | 'FIRING';
export type RuleEvalCategory = 'OK' | 'NO_DATA' | 'DATASOURCE_ERROR';

@Entity({ name: 'rule_states' })
@Index(['workspaceId', 'ruleId'], { unique: true })
export class RuleState {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', nullable: true })
  workspaceId!: string | null;

  @Column({ type: 'uuid' })
  ruleId!: string;

  @Column({ type: 'varchar', length: 16, default: 'OK' })
  state!: RuleRunState;

  @Column({ type: 'timestamptz', nullable: true })
  pendingSince!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  firingSince!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastSentAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastEvalAt!: Date | null;

  @Column({ type: 'boolean', nullable: true })
  lastEvalOk!: boolean | null;

  @Column({ type: 'text', nullable: true })
  lastEvalError!: string | null;

  @Column({ type: 'varchar', length: 24, default: 'OK' })
  lastEvalCategory!: RuleEvalCategory;

  @Column({ type: 'double precision', nullable: true })
  lastValue!: number | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
