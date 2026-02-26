import { Controller, Get, Query } from '@nestjs/common';
import { RuleStatesService } from '../services/rule-states.service';
import { CurrentWorkspaceId } from '../../auth/decorators/current-auth.decorator';

@Controller('api/rule-states')
export class RuleStatesController {
  constructor(private readonly states: RuleStatesService) {}

  @Get()
  list(@CurrentWorkspaceId() workspaceId: string, @Query('appId') appId?: string) {
    return this.states.list(workspaceId, appId);
  }
}
