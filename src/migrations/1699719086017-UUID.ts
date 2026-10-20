import { MigrationInterface, QueryRunner } from 'typeorm';

export class UUID1699719086017 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP EXTENSION IF EXISTS "uuid-ossp";
      CREATE EXTENSION "uuid-ossp";
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP EXTENSION "uuid-ossp";
    `);
  }
}
