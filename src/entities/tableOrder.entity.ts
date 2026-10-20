import {
  BaseEntity,
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';

@Entity({
  name: 'table_order',
})
export class TableOrder extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: string;

  @Column({ length: 255 })
  status: string;

  @Column({ length: 255 })
  table: string;

  @Column({ length: 255 })
  orderId: string;

  @Column({ name: 'pre_order', length: 100000 })
  preOrder: string;

  @Column({ length: 100000 })
  order: string;

  @CreateDateColumn({
    name: 'created_at',
  })
  createdAt: Date;
}
