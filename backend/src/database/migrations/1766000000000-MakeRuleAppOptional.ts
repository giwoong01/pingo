import { MigrationInterface, QueryRunner } from 'typeorm';

export class MakeRuleAppOptional1766000000000 implements MigrationInterface {
  name = 'MakeRuleAppOptional1766000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "rules" ALTER COLUMN "appId" DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE "alert_events" ALTER COLUMN "appId" DROP NOT NULL`);

    await queryRunner.query(`
      DO $$
        IF EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'FK_rules_app'
        ) THEN
          ALTER TABLE "rules" DROP CONSTRAINT "FK_rules_app";
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      ALTER TABLE "rules"
      ADD CONSTRAINT "FK_rules_app"
      FOREIGN KEY ("appId") REFERENCES "apps"("id") ON DELETE SET NULL
    `);

    await queryRunner.query(`
      DO $$
        IF EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'FK_alert_events_app'
        ) THEN
          ALTER TABLE "alert_events" DROP CONSTRAINT "FK_alert_events_app";
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      ALTER TABLE "alert_events"
      ADD CONSTRAINT "FK_alert_events_app"
      FOREIGN KEY ("appId") REFERENCES "apps"("id") ON DELETE SET NULL
    `);
  }

  public async down(): Promise<void> {
  }
}
