import { MigrationInterface, QueryRunner } from 'typeorm';

export class MenuList1700495656250 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
        CREATE TABLE menu_list(
            id uuid PRIMARY KEY DEFAULT uuid_generate_v1(),
            menu jsonb NULL
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE menu_list`);
  }
}
