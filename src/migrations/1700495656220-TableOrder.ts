import { MigrationInterface, QueryRunner } from 'typeorm';

export class TableOrder1700495656220 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
        CREATE TABLE Table_Order(
            id         uuid PRIMARY KEY DEFAULT uuid_generate_v1(),
            "table"    VARCHAR(255),
            "orderId"  VARCHAR(255),
            "order"    VARCHAR(100000),
            created_at timestamp DEFAULT NOW()
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE Table_Order`);
  }
}
