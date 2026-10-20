import { MigrationInterface, QueryRunner } from 'typeorm';

export class TableOrder_Add_PreOrder_Field1700495656230 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
        ALTER TABLE Table_Order ADD pre_order VARCHAR(100000); 
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE Table_Order DROP pre_order;`);
  }
}
