import {
  BaseEntity,
  Entity,
  Column,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({
  name: 'menu_list',
})
export class MenuList extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: string;

  @Column({ type: 'jsonb' })
  menu: object;
}
