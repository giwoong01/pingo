import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitSchema1760000000000 implements MigrationInterface {
  name = 'InitSchema1760000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "users" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "email" varchar(190) NOT NULL,
        "name" varchar(120),
        "passwordHash" text NOT NULL,
        "enabled" boolean NOT NULL DEFAULT true,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_users_email_unique" ON "users" ("email")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "workspaces" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" varchar(120) NOT NULL,
        "slug" varchar(140) NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_workspaces_slug_unique" ON "workspaces" ("slug")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "workspace_members" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "workspaceId" uuid NOT NULL,
        "userId" uuid NOT NULL,
        "role" varchar(16) NOT NULL DEFAULT 'MEMBER',
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_workspace_members_workspace_user_unique" ON "workspace_members" ("workspaceId", "userId")`,
    );
    await queryRunner.query(`
      DO $$
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'FK_workspace_members_workspace'
        ) THEN
          ALTER TABLE "workspace_members"
            ADD CONSTRAINT "FK_workspace_members_workspace"
            FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE;
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      DO $$
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'FK_workspace_members_user'
        ) THEN
          ALTER TABLE "workspace_members"
            ADD CONSTRAINT "FK_workspace_members_user"
            FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "workspace_invites" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "workspaceId" uuid NOT NULL,
        "role" varchar(16) NOT NULL DEFAULT 'MEMBER',
        "invitedEmail" varchar(240),
        "token" varchar(180) NOT NULL,
        "createdByUserId" uuid NOT NULL,
        "acceptedByUserId" uuid,
        "expiresAt" timestamptz NOT NULL,
        "acceptedAt" timestamptz,
        "revokedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_workspace_invites_token_unique" ON "workspace_invites" ("token")`);
    await queryRunner.query(`
      DO $$
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'FK_workspace_invites_workspace'
        ) THEN
          ALTER TABLE "workspace_invites"
            ADD CONSTRAINT "FK_workspace_invites_workspace"
            FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "memory_metrics" (
        "id" bigserial PRIMARY KEY,
        "value" bigint NOT NULL,
        "status" varchar NOT NULL,
        "timestamp" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "clusters" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "workspaceId" uuid,
        "name" varchar(120) NOT NULL,
        "prometheusUrl" text NOT NULL,
        "enabled" boolean NOT NULL DEFAULT true,
        "bearerTokenEnc" text,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_clusters_workspace_name_unique" ON "clusters" ("workspaceId", "name")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "apps" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "workspaceId" uuid,
        "clusterId" uuid NOT NULL,
        "name" varchar(160) NOT NULL,
        "owner" varchar(120),
        "job" varchar(200) NOT NULL,
        "enabled" boolean NOT NULL DEFAULT true,
        "widgetLayout" text,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_apps_workspace_cluster_job_unique" ON "apps" ("workspaceId", "clusterId", "job")`);
    await queryRunner.query(`
      DO $$
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'FK_apps_cluster'
        ) THEN
          ALTER TABLE "apps"
            ADD CONSTRAINT "FK_apps_cluster"
            FOREIGN KEY ("clusterId") REFERENCES "clusters"("id") ON DELETE CASCADE;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "instances" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "workspaceId" uuid,
        "clusterId" uuid NOT NULL,
        "appId" uuid,
        "name" varchar(160) NOT NULL,
        "owner" varchar(120),
        "provider" varchar(32) NOT NULL DEFAULT 'oracle',
        "publicIp" varchar(80),
        "privateIp" varchar(80),
        "region" varchar(80),
        "env" varchar(60),
        "prometheusInstance" varchar(200) NOT NULL,
        "enabled" boolean NOT NULL DEFAULT true,
        "widgetLayout" text,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_instances_workspace_cluster_prom_unique" ON "instances" ("workspaceId", "clusterId", "prometheusInstance")`,
    );
    await queryRunner.query(`
      DO $$
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'FK_instances_cluster'
        ) THEN
          ALTER TABLE "instances"
            ADD CONSTRAINT "FK_instances_cluster"
            FOREIGN KEY ("clusterId") REFERENCES "clusters"("id") ON DELETE CASCADE;
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      DO $$
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'FK_instances_app'
        ) THEN
          ALTER TABLE "instances"
            ADD CONSTRAINT "FK_instances_app"
            FOREIGN KEY ("appId") REFERENCES "apps"("id") ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "webhooks" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "workspaceId" uuid,
        "name" varchar(120) NOT NULL,
        "discordUrl" text NOT NULL,
        "enabled" boolean NOT NULL DEFAULT true,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_webhooks_workspace_name_unique" ON "webhooks" ("workspaceId", "name")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "rules" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "workspaceId" uuid,
        "appId" uuid NOT NULL,
        "instanceId" uuid,
        "name" varchar(200) NOT NULL,
        "severity" varchar(30) NOT NULL DEFAULT 'MEDIUM',
        "kind" varchar(40) NOT NULL DEFAULT 'CUSTOM',
        "expr" text NOT NULL,
        "intervalSeconds" int NOT NULL DEFAULT 60,
        "forSeconds" int NOT NULL DEFAULT 60,
        "cooldownSeconds" int NOT NULL DEFAULT 600,
        "enabled" boolean NOT NULL DEFAULT true,
        "runbook" jsonb,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_rules_workspace_app_name_unique" ON "rules" ("workspaceId", "appId", "name")`);
    await queryRunner.query(`
      DO $$
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'FK_rules_app'
        ) THEN
          ALTER TABLE "rules"
            ADD CONSTRAINT "FK_rules_app"
            FOREIGN KEY ("appId") REFERENCES "apps"("id") ON DELETE CASCADE;
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      DO $$
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'FK_rules_instance'
        ) THEN
          ALTER TABLE "rules"
            ADD CONSTRAINT "FK_rules_instance"
            FOREIGN KEY ("instanceId") REFERENCES "instances"("id") ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "rule_webhooks" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "ruleId" uuid NOT NULL,
        "webhookId" uuid NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_rule_webhooks_rule_webhook_unique" ON "rule_webhooks" ("ruleId", "webhookId")`);
    await queryRunner.query(`
      DO $$
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'FK_rule_webhooks_rule'
        ) THEN
          ALTER TABLE "rule_webhooks"
            ADD CONSTRAINT "FK_rule_webhooks_rule"
            FOREIGN KEY ("ruleId") REFERENCES "rules"("id") ON DELETE CASCADE;
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      DO $$
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'FK_rule_webhooks_webhook'
        ) THEN
          ALTER TABLE "rule_webhooks"
            ADD CONSTRAINT "FK_rule_webhooks_webhook"
            FOREIGN KEY ("webhookId") REFERENCES "webhooks"("id") ON DELETE CASCADE;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "rule_states" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "workspaceId" uuid,
        "ruleId" uuid NOT NULL,
        "state" varchar(16) NOT NULL DEFAULT 'OK',
        "pendingSince" timestamptz,
        "firingSince" timestamptz,
        "lastSentAt" timestamptz,
        "lastEvalAt" timestamptz,
        "lastEvalOk" boolean,
        "lastEvalError" text,
        "lastEvalCategory" varchar(24) NOT NULL DEFAULT 'OK',
        "lastValue" double precision,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_rule_states_workspace_rule_unique" ON "rule_states" ("workspaceId", "ruleId")`);
    await queryRunner.query(`ALTER TABLE "rule_states" ADD COLUMN IF NOT EXISTS "lastEvalCategory" varchar(24) NOT NULL DEFAULT 'OK'`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "alert_events" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "workspaceId" uuid,
        "ruleId" uuid NOT NULL,
        "appId" uuid NOT NULL,
        "status" varchar(16) NOT NULL,
        "startedAt" timestamptz NOT NULL,
        "endedAt" timestamptz,
        "value" double precision,
        "snapshot" jsonb,
        "aiReport" jsonb,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_alert_events_workspace_rule_status_startedAt" ON "alert_events" ("workspaceId", "ruleId", "status", "startedAt")`,
    );
    await queryRunner.query(`
      DO $$
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'FK_alert_events_rule'
        ) THEN
          ALTER TABLE "alert_events"
            ADD CONSTRAINT "FK_alert_events_rule"
            FOREIGN KEY ("ruleId") REFERENCES "rules"("id") ON DELETE CASCADE;
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      DO $$
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'FK_alert_events_app'
        ) THEN
          ALTER TABLE "alert_events"
            ADD CONSTRAINT "FK_alert_events_app"
            FOREIGN KEY ("appId") REFERENCES "apps"("id") ON DELETE CASCADE;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "notification_routes" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "workspaceId" uuid,
        "name" varchar(120) NOT NULL,
        "enabled" boolean NOT NULL DEFAULT true,
        "priority" int NOT NULL DEFAULT 100,
        "appId" uuid,
        "instanceId" uuid,
        "severity" varchar(30),
        "webhookIds" jsonb,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_notification_routes_workspace_name_unique" ON "notification_routes" ("workspaceId", "name")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "notification_silences" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "workspaceId" uuid,
        "name" varchar(120) NOT NULL,
        "enabled" boolean NOT NULL DEFAULT true,
        "appId" uuid,
        "instanceId" uuid,
        "severity" varchar(30),
        "timezone" varchar(64) NOT NULL DEFAULT 'UTC',
        "daysOfWeek" jsonb,
        "startTime" varchar(5) NOT NULL,
        "endTime" varchar(5) NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_notification_silences_workspace_name_unique" ON "notification_silences" ("workspaceId", "name")`,
    );
  }

  public async down(): Promise<void> {
  }
}
