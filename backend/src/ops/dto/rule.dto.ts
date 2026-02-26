import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type { RuleKind, RuleSeverity } from '../entities/rule.entity';

export type RuleWebhookMode = 'ALL' | 'SELECTED';

export class CreateRuleDto {
  @IsUUID()
  @IsOptional()
  appId?: string;

  @IsUUID()
  @IsOptional()
  instanceId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @IsIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
  @IsOptional()
  severity?: RuleSeverity;

  @IsString()
  @IsOptional()
  kind?: RuleKind;

  @IsString()
  @IsNotEmpty()
  expr!: string;

  @IsInt()
  @Min(5)
  @Max(3600)
  @IsOptional()
  intervalSeconds?: number;

  @IsInt()
  @Min(0)
  @Max(24 * 60 * 60)
  @IsOptional()
  forSeconds?: number;

  @IsInt()
  @Min(0)
  @Max(24 * 60 * 60)
  @IsOptional()
  cooldownSeconds?: number;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  runbookUrl?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  runbookSteps?: string[];

  @IsIn(['ALL', 'SELECTED'])
  @IsOptional()
  webhookMode?: RuleWebhookMode;

  @IsArray()
  @ArrayMinSize(1)
  @IsUUID(undefined, { each: true })
  @IsOptional()
  webhookIds?: string[];
}

export class UpdateRuleDto {
  @IsUUID()
  @IsOptional()
  instanceId?: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  name?: string;

  @IsIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
  @IsOptional()
  severity?: RuleSeverity;

  @IsString()
  @IsOptional()
  kind?: RuleKind;

  @IsString()
  @IsOptional()
  expr?: string;

  @IsInt()
  @Min(5)
  @Max(3600)
  @IsOptional()
  intervalSeconds?: number;

  @IsInt()
  @Min(0)
  @Max(24 * 60 * 60)
  @IsOptional()
  forSeconds?: number;

  @IsInt()
  @Min(0)
  @Max(24 * 60 * 60)
  @IsOptional()
  cooldownSeconds?: number;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  runbookUrl?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  runbookSteps?: string[];

  @IsIn(['ALL', 'SELECTED'])
  @IsOptional()
  webhookMode?: RuleWebhookMode;

  @IsArray()
  @ArrayMinSize(1)
  @IsUUID(undefined, { each: true })
  @IsOptional()
  webhookIds?: string[];
}

export class CreateRuleFromPresetDto {
  @IsUUID()
  @IsOptional()
  appId?: string;

  @IsUUID()
  @IsOptional()
  instanceId?: string;

  @IsString()
  @IsNotEmpty()
  presetId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @IsIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
  @IsOptional()
  severity?: RuleSeverity;

  @IsString()
  @IsOptional()
  threshold?: string;

  @IsInt()
  @Min(5)
  @Max(3600)
  @IsOptional()
  intervalSeconds?: number;

  @IsInt()
  @Min(0)
  @Max(24 * 60 * 60)
  @IsOptional()
  forSeconds?: number;

  @IsInt()
  @Min(0)
  @Max(24 * 60 * 60)
  @IsOptional()
  cooldownSeconds?: number;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  runbookUrl?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  runbookSteps?: string[];

  @IsIn(['ALL', 'SELECTED'])
  @IsOptional()
  webhookMode?: RuleWebhookMode;

  @IsArray()
  @ArrayMinSize(1)
  @IsUUID(undefined, { each: true })
  @IsOptional()
  webhookIds?: string[];
}
