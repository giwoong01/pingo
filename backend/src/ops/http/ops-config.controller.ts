import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CurrentWorkspaceId } from '../../auth/decorators/current-auth.decorator';
import { ImportOpsConfigDto } from '../dto/ops-config.dto';
import { OpsConfigService } from '../services/ops-config.service';

@Controller('api/ops-config')
export class OpsConfigController {
  constructor(private readonly opsConfig: OpsConfigService) {}

  @Get('export')
  exportConfig(
    @CurrentWorkspaceId() workspaceId: string,
    @Query('includeSecrets') includeSecrets?: string,
  ) {
    return this.opsConfig.exportWorkspace(workspaceId, includeSecrets === 'true');
  }

  @Post('import')
  importConfig(@CurrentWorkspaceId() workspaceId: string, @Body() dto: ImportOpsConfigDto) {
    return this.opsConfig.importWorkspace(workspaceId, dto || {});
  }
}

