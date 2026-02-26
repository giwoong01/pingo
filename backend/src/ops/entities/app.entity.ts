import { Column, CreateDateColumn, Entity, Index, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Cluster } from './cluster.entity';

@Entity({ name: 'apps' })
@Index(['workspaceId', 'clusterId', 'job'], { unique: true })
export class App {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', nullable: true })
  workspaceId!: string | null;

  @Column({ type: 'uuid' })
  clusterId!: string;

  @ManyToOne(() => Cluster, { onDelete: 'CASCADE' })
  cluster!: Cluster;

  @Column({ type: 'varchar', length: 160 })
  name!: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  owner!: string | null;

  @Column({ type: 'varchar', length: 200 })
  job!: string;

  @Column({ type: 'boolean', default: true })
  enabled!: boolean;

  @Column({ type: 'simple-json', nullable: true })
  widgetLayout!: any[] | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
