import { Column, CreateDateColumn, Entity, Index, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Rule } from './rule.entity';
import { Webhook } from './webhook.entity';

@Entity({ name: 'rule_webhooks' })
@Index(['ruleId', 'webhookId'], { unique: true })
export class RuleWebhook {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  ruleId!: string;

  @ManyToOne(() => Rule, { onDelete: 'CASCADE' })
  rule!: Rule;

  @Column({ type: 'uuid' })
  webhookId!: string;

  @ManyToOne(() => Webhook, { onDelete: 'CASCADE' })
  webhook!: Webhook;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

