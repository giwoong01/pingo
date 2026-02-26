import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { RulesService } from '../services/rules.service';
import { CreateRuleDto, CreateRuleFromPresetDto, UpdateRuleDto } from '../dto/rule.dto';
import { CurrentWorkspaceId } from '../../auth/decorators/current-auth.decorator';

@Controller('api/rules')
export class RulesController {
  constructor(private readonly rules: RulesService) {}

  @Get()
  list(
    @CurrentWorkspaceId() workspaceId: string,
    @Query('appId') appId?: string,
    @Query('instanceId') instanceId?: string,
  ) {
    return this.rules.list(workspaceId, appId, instanceId);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentWorkspaceId() workspaceId: string) {
    return this.rules.get(id, workspaceId);
  }

  @Post()
  create(@Body() dto: CreateRuleDto, @CurrentWorkspaceId() workspaceId: string) {
    return this.rules.create(dto, workspaceId);
  }

  @Post('from-preset')
  createFromPreset(@Body() dto: CreateRuleFromPresetDto, @CurrentWorkspaceId() workspaceId: string) {
    return this.rules.createFromPreset(dto, workspaceId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateRuleDto, @CurrentWorkspaceId() workspaceId: string) {
    return this.rules.update(id, dto, workspaceId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentWorkspaceId() workspaceId: string) {
    return this.rules.remove(id, workspaceId);
  }

  @Post(':id/test')
  test(@Param('id') id: string, @CurrentWorkspaceId() workspaceId: string) {
    return this.rules.testRule(id, workspaceId);
  }
}
