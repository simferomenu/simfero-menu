import { MigrationInterface, QueryRunner } from 'typeorm';

export class TableOrder_Add_Status_Field1700495656240 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
        ALTER TABLE Table_Order ADD status VARCHAR(255); 
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE Table_Order DROP status;`);
  }
}
