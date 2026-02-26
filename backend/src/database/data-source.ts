import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { User } from '../auth/entities/user.entity';
import { Workspace } from '../auth/entities/workspace.entity';
import { WorkspaceMember } from '../auth/entities/workspace-member.entity';
import { WorkspaceInvite } from '../auth/entities/workspace-invite.entity';
import { MemoryMetric } from '../monitoring/entities/memory-metric.entity';
import { Cluster } from '../ops/entities/cluster.entity';
import { App } from '../ops/entities/app.entity';
import { Instance } from '../ops/entities/instance.entity';
import { Rule } from '../ops/entities/rule.entity';
import { RuleState } from '../ops/entities/rule-state.entity';
import { Webhook } from '../ops/entities/webhook.entity';
import { RuleWebhook } from '../ops/entities/rule-webhook.entity';
import { AlertEvent } from '../ops/entities/alert-event.entity';
import { NotificationRoute } from '../ops/entities/notification-route.entity';
import { NotificationSilence } from '../ops/entities/notification-silence.entity';

const port = Number(process.env.DB_PORT || 5432);

export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: Number.isFinite(port) ? port : 5432,
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'monitoring',
  synchronize: false,
  logging: false,
  entities: [
  ],
  migrations: [__dirname + '/migrations/*.{ts,js}'],
});

