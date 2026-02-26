import { Controller, Get, Query } from '@nestjs/common';
import { AlertsService } from '../services/alerts.service';
import { CurrentWorkspaceId } from '../../auth/decorators/current-auth.decorator';

@Controller('api/alerts')
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}

  @Get()
  list(
    @CurrentWorkspaceId() workspaceId: string,
    @Query('limit') limit?: string,
    @Query('appId') appId?: string,
    @Query('instanceId') instanceId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const n = Number(limit);
    const safe = Number.isFinite(n) && n > 0 ? n : 100;
    const parsedFrom = from ? new Date(from) : null;
    const parsedTo = to ? new Date(to) : null;
    return this.alerts.list({
      workspaceId,
      limit: safe,
      appId: appId || undefined,
      instanceId: instanceId || undefined,
      from: parsedFrom && Number.isFinite(parsedFrom.getTime()) ? parsedFrom : null,
      to: parsedTo && Number.isFinite(parsedTo.getTime()) ? parsedTo : null,
    });
  }
}
