import { Column, CreateDateColumn, Entity, Index, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Cluster } from './cluster.entity';
import { App } from './app.entity';

@Entity({ name: 'instances' })
@Index(['workspaceId', 'clusterId', 'prometheusInstance'], { unique: true })
export class Instance {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', nullable: true })
  workspaceId!: string | null;

  @Column({ type: 'uuid' })
  clusterId!: string;

  @ManyToOne(() => Cluster, { onDelete: 'CASCADE' })
  cluster!: Cluster;

  @Column({ type: 'uuid', nullable: true })
  appId!: string | null;

  @ManyToOne(() => App, { onDelete: 'SET NULL', nullable: true })
  app!: App | null;

  @Column({ type: 'varchar', length: 160 })
  name!: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  owner!: string | null;

  @Column({ type: 'varchar', length: 32, default: 'oracle' })
  provider!: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  publicIp!: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  privateIp!: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  region!: string | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  env!: string | null;

  @Column({ type: 'varchar', length: 200 })
  prometheusInstance!: string;

  @Column({ type: 'boolean', default: true })
  enabled!: boolean;

  @Column({ type: 'simple-json', nullable: true })
  widgetLayout!: any[] | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
