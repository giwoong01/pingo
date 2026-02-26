import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { MonitoringController } from './monitoring.controller';
import { MonitoringService } from './monitoring.service';
import { MemoryMetric } from './entities/memory-metric.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([MemoryMetric]),
    HttpModule,
  ],
  controllers: [MonitoringController],
  providers: [MonitoringService],
})
export class MonitoringModule {}