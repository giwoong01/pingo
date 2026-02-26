import { Body, Controller, Delete, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { InstancesService } from '../services/instances.service';
import { CreateInstanceDto, UpdateInstanceDto } from '../dto/instance.dto';
import { CurrentWorkspaceId } from '../../auth/decorators/current-auth.decorator';

@Controller('api/instances')
export class InstancesController {
  constructor(private readonly instances: InstancesService) {}

  @Get()
  list(@CurrentWorkspaceId() workspaceId: string) {
    return this.instances.list(workspaceId);
  }

  @Get('cluster/:clusterId/discover')
  discover(@Param('clusterId') clusterId: string, @CurrentWorkspaceId() workspaceId: string) {
    return this.instances.discover(clusterId, workspaceId);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentWorkspaceId() workspaceId: string) {
    return this.instances.get(id, workspaceId);
  }

  @Post()
  create(@Body() dto: CreateInstanceDto, @CurrentWorkspaceId() workspaceId: string) {
    return this.instances.create(dto, workspaceId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateInstanceDto, @CurrentWorkspaceId() workspaceId: string) {
    return this.instances.update(id, dto, workspaceId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentWorkspaceId() workspaceId: string) {
    return this.instances.remove(id, workspaceId);
  }

  @Get(':id/widget-layout')
  getWidgetLayout(@Param('id') id: string, @CurrentWorkspaceId() workspaceId: string) {
    return this.instances.getWidgetLayout(id, workspaceId);
  }

  @Put(':id/widget-layout')
  saveWidgetLayout(@Param('id') id: string, @Body() body: { widgets?: any[] }, @CurrentWorkspaceId() workspaceId: string) {
    return this.instances.saveWidgetLayout(id, body?.widgets || [], workspaceId);
  }

  @Post(':id/test')
  test(@Param('id') id: string, @CurrentWorkspaceId() workspaceId: string) {
    return this.instances.test(id, workspaceId);
  }
}
