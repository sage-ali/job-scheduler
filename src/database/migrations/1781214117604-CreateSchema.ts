import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSchema1781214117604 implements MigrationInterface {
  name = 'CreateSchema1781214117604';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "jobs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "type" character varying NOT NULL, "payload" jsonb NOT NULL, "priority" integer NOT NULL DEFAULT '2', "status" character varying NOT NULL DEFAULT 'pending', "retry_count" integer NOT NULL DEFAULT '0', "max_retries" integer NOT NULL DEFAULT '3', "error_message" text, "scheduled_at" TIMESTAMP WITH TIME ZONE, "recurring_interval" character varying, "next_run_at" TIMESTAMP WITH TIME ZONE, "started_at" TIMESTAMP WITH TIME ZONE, "completed_at" TIMESTAMP WITH TIME ZONE, "depends_on" text, "priority_score" double precision NOT NULL DEFAULT '0', CONSTRAINT "PK_cf0a6c42b72fcc7f7c237def345" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "dlq_jobs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "original_job_id" uuid NOT NULL, "type" character varying NOT NULL, "payload" jsonb NOT NULL, "priority" integer NOT NULL, "error_message" text NOT NULL, "retry_count" integer NOT NULL DEFAULT '3', "last_attempted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_b66854fe15c059508260c5100ca" PRIMARY KEY ("id"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "dlq_jobs"`);
    await queryRunner.query(`DROP TABLE "jobs"`);
  }
}
