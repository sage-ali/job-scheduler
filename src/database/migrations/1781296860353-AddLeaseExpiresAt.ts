import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLeaseExpiresAt1781296860353 implements MigrationInterface {
  name = 'AddLeaseExpiresAt1781296860353';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "jobs" ADD "lease_expires_at" TIMESTAMP WITH TIME ZONE`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "jobs" DROP COLUMN "lease_expires_at"`);
  }
}
