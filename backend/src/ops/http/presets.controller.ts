import { Controller, Get } from '@nestjs/common';
import { PresetsService } from '../services/presets.service';

@Controller('api/presets')
export class PresetsController {
  constructor(private readonly presets: PresetsService) {}

  @Get('rules')
  listRulePresets() {
    return this.presets.list();
  }
}

