import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { MonitoringService } from './monitoring.service';
import { AnalyzeRequestDto } from './dto/analyze-request.dto';

@Controller('api/monitoring')
export class MonitoringController {
  constructor(private readonly monitoringService: MonitoringService) {}

  @Get('current')
  async getCurrent() {
    return this.monitoringService.getCurrentMemory();
  }

  @Get('instance/current')
  async getCurrentInstance(@Query('instance') instance?: string, @Query('target') target?: string) {
    const scopedTarget = String(target || instance || '').trim();
    return this.monitoringService.getCurrentInstanceMemory(scopedTarget || undefined);
  }

  @Get('instance/timeseries')
  async getInstanceTimeseries(
    @Query('metric') metric?: string,
    @Query('instance') instance?: string,
    @Query('target') target?: string,
    @Query('minutes') minutes?: string,
    @Query('stepSec') stepSec?: string,
  ) {
    const scopedTarget = String(target || instance || '').trim();
    const m = String(metric || 'memory_usage_percent');
    const min = Number(minutes);
    const step = Number(stepSec);
    return this.monitoringService.getInstanceTimeseries(
      scopedTarget || undefined,
      m,
      Number.isFinite(min) && min > 0 ? min : 60,
      Number.isFinite(step) && step > 0 ? step : 30,
    );
  }

  @Get('history')
  async getHistory(
    @Query('limit') limit: number = 50,
    @Query('duration') duration: string = '1h'
  ) {
    return this.monitoringService.getHistory(limit, duration);
  }

  @Post('analyze')
  async analyze(@Body() dto: AnalyzeRequestDto) {
    return this.monitoringService.analyzeMemory(dto);
  }
}
