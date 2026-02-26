import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('memory_metrics')
export class MemoryMetric {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'bigint' })
  value: number;

  @Column()
  status: string;

  @CreateDateColumn()
  timestamp: Date;
}