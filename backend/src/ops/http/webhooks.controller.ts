import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { WebhooksService } from '../services/webhooks.service';
import {
  CreateNotificationRouteDto,
  CreateNotificationSilenceDto,
  CreateWebhookDto,
  UpdateNotificationRouteDto,
  UpdateNotificationSilenceDto,
  UpdateWebhookDto,
} from '../dto/webhook.dto';
import { CurrentWorkspaceId } from '../../auth/decorators/current-auth.decorator';

@Controller('api/webhooks')
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Get('routes')
  listRoutes(@CurrentWorkspaceId() workspaceId: string) {
    return this.webhooks.listRoutes(workspaceId);
  }

  @Post('routes')
  createRoute(@Body() dto: CreateNotificationRouteDto, @CurrentWorkspaceId() workspaceId: string) {
    return this.webhooks.createRoute(dto, workspaceId);
  }

  @Patch('routes/:id')
  updateRoute(@Param('id') id: string, @Body() dto: UpdateNotificationRouteDto, @CurrentWorkspaceId() workspaceId: string) {
    return this.webhooks.updateRoute(id, dto, workspaceId);
  }

  @Delete('routes/:id')
  removeRoute(@Param('id') id: string, @CurrentWorkspaceId() workspaceId: string) {
    return this.webhooks.removeRoute(id, workspaceId);
  }

  @Get('silences')
  listSilences(@CurrentWorkspaceId() workspaceId: string) {
    return this.webhooks.listSilences(workspaceId);
  }

  @Post('silences')
  createSilence(@Body() dto: CreateNotificationSilenceDto, @CurrentWorkspaceId() workspaceId: string) {
    return this.webhooks.createSilence(dto, workspaceId);
  }

  @Patch('silences/:id')
  updateSilence(@Param('id') id: string, @Body() dto: UpdateNotificationSilenceDto, @CurrentWorkspaceId() workspaceId: string) {
    return this.webhooks.updateSilence(id, dto, workspaceId);
  }

  @Delete('silences/:id')
  removeSilence(@Param('id') id: string, @CurrentWorkspaceId() workspaceId: string) {
    return this.webhooks.removeSilence(id, workspaceId);
  }

  @Get()
  list(@CurrentWorkspaceId() workspaceId: string) {
    return this.webhooks.list(workspaceId);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentWorkspaceId() workspaceId: string) {
    return this.webhooks.get(id, workspaceId);
  }

  @Post()
  create(@Body() dto: CreateWebhookDto, @CurrentWorkspaceId() workspaceId: string) {
    return this.webhooks.create(dto, workspaceId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateWebhookDto, @CurrentWorkspaceId() workspaceId: string) {
    return this.webhooks.update(id, dto, workspaceId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentWorkspaceId() workspaceId: string) {
    return this.webhooks.remove(id, workspaceId);
  }
}
