import { MigrationInterface, QueryRunner } from 'typeorm';

export class Config1700495656210 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
        CREATE TABLE config(
            id uuid PRIMARY KEY DEFAULT uuid_generate_v1(),
            name VARCHAR(255),
            value VARCHAR(255)
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE config`);
  }
}
