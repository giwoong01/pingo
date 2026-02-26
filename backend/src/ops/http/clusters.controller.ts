import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ClustersService } from '../services/clusters.service';
import { CreateClusterDto, UpdateClusterDto } from '../dto/cluster.dto';
import { CurrentWorkspaceId } from '../../auth/decorators/current-auth.decorator';

@Controller('api/clusters')
export class ClustersController {
  constructor(private readonly clusters: ClustersService) {}

  @Get()
  list(@CurrentWorkspaceId() workspaceId: string) {
    return this.clusters.list(workspaceId);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentWorkspaceId() workspaceId: string) {
    return this.clusters.get(id, workspaceId);
  }

  @Post()
  create(@Body() dto: CreateClusterDto, @CurrentWorkspaceId() workspaceId: string) {
    return this.clusters.create(dto, workspaceId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateClusterDto, @CurrentWorkspaceId() workspaceId: string) {
    return this.clusters.update(id, dto, workspaceId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentWorkspaceId() workspaceId: string) {
    return this.clusters.remove(id, workspaceId);
  }

  @Post(':id/test')
  test(@Param('id') id: string, @CurrentWorkspaceId() workspaceId: string) {
    return this.clusters.testConnection(id, workspaceId);
  }

  @Get(':id/jobs')
  jobs(@Param('id') id: string, @CurrentWorkspaceId() workspaceId: string) {
    return this.clusters.listJobs(id, workspaceId);
  }

  @Get(':id/job-hints')
  jobHints(@Param('id') id: string, @CurrentWorkspaceId() workspaceId: string) {
    return this.clusters.jobHints(id, workspaceId);
  }
}
