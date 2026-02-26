import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { AppsService } from '../services/apps.service';
import { CreateAppDto, UpdateAppDto } from '../dto/app.dto';
import { AppMetricsService, AppMetricKey } from '../services/app-metrics.service';
import { AppHealthService } from '../services/app-health.service';
import { CurrentWorkspaceId } from '../../auth/decorators/current-auth.decorator';

@Controller('api/apps')
export class AppsController {
  constructor(
    private readonly apps: AppsService,
    private readonly metrics: AppMetricsService,
    private readonly health: AppHealthService,
  ) {}

  @Get()
  list(@CurrentWorkspaceId() workspaceId: string) {
    return this.apps.list(workspaceId);
  }

  @Get('health')
  healthList(@CurrentWorkspaceId() workspaceId: string) {
    return this.health.listHealth(workspaceId);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentWorkspaceId() workspaceId: string) {
    return this.apps.get(id, workspaceId);
  }

  @Post()
  create(@Body() dto: CreateAppDto, @CurrentWorkspaceId() workspaceId: string) {
    return this.apps.create(dto, workspaceId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAppDto, @CurrentWorkspaceId() workspaceId: string) {
    return this.apps.update(id, dto, workspaceId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentWorkspaceId() workspaceId: string) {
    return this.apps.remove(id, workspaceId);
  }

  @Get(':id/widget-layout')
  getWidgetLayout(@Param('id') id: string, @CurrentWorkspaceId() workspaceId: string) {
    return this.apps.getWidgetLayout(id, workspaceId);
  }

  @Put(':id/widget-layout')
  saveWidgetLayout(@Param('id') id: string, @Body() body: { widgets?: any[] }, @CurrentWorkspaceId() workspaceId: string) {
    return this.apps.saveWidgetLayout(id, body?.widgets || [], workspaceId);
  }

  @Post(':id/test-job')
  testJob(@Param('id') id: string, @CurrentWorkspaceId() workspaceId: string) {
    return this.apps.testJob(id, workspaceId);
  }

  @Get(':id/targets')
  targets(@Param('id') id: string, @CurrentWorkspaceId() workspaceId: string) {
    return this.apps.targets(id, workspaceId);
  }

  @Get(':id/summary')
  summary(@Param('id') id: string, @CurrentWorkspaceId() workspaceId: string, @Query('instance') instance?: string) {
    const scopedInstance = String(instance || '').trim();
    return this.metrics.getSummary(id, workspaceId, scopedInstance || undefined);
  }

  @Get(':id/timeseries')
  timeseries(
    @Param('id') id: string,
    @Query('metric') metric: AppMetricKey,
    @Query('minutes') minutes?: string,
    @Query('stepSec') stepSec?: string,
    @CurrentWorkspaceId() workspaceId?: string,
    @Query('instance') instance?: string,
  ) {
    const m = (metric || 'rps') as AppMetricKey;
    const min = Number(minutes);
    const step = Number(stepSec);
    const scopedInstance = String(instance || '').trim();
    return this.metrics.getTimeseries(
      id,
      String(workspaceId || ''),
      m,
      Number.isFinite(min) && min > 0 ? min : 60,
      Number.isFinite(step) && step > 0 ? step : 30,
      scopedInstance || undefined,
    );
  }

  @Get(':id/custom-query')
  customQuery(
    @Param('id') id: string,
    @CurrentWorkspaceId() workspaceId: string,
    @Query('expr') expr?: string,
    @Query('instance') instance?: string,
  ) {
    const scopedInstance = String(instance || '').trim();
    return this.metrics.queryCustomScalar(id, workspaceId, String(expr || ''), scopedInstance || undefined);
  }

  @Get(':id/custom-timeseries')
  customTimeseries(
    @Param('id') id: string,
    @Query('expr') expr?: string,
    @Query('minutes') minutes?: string,
    @Query('stepSec') stepSec?: string,
    @CurrentWorkspaceId() workspaceId?: string,
    @Query('instance') instance?: string,
  ) {
    const min = Number(minutes);
    const step = Number(stepSec);
    const scopedInstance = String(instance || '').trim();
    return this.metrics.queryCustomTimeseries(
      id,
      String(workspaceId || ''),
      String(expr || ''),
      Number.isFinite(min) && min > 0 ? min : 60,
      Number.isFinite(step) && step > 0 ? step : 30,
      scopedInstance || undefined,
    );
  }
}
