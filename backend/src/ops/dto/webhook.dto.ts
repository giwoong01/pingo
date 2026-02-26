import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class CreateWebhookDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @IsUrl({ require_tld: false })
  discordUrl!: string;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;
}

export class UpdateWebhookDto {
  @IsString()
  @IsOptional()
  @MaxLength(120)
  name?: string;

  @IsString()
  @IsOptional()
  @IsUrl({ require_tld: false })
  discordUrl?: string;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;
}

export class CreateNotificationRouteDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @IsOptional()
  priority?: number;

  @IsString()
  @IsOptional()
  appId?: string;

  @IsString()
  @IsOptional()
  instanceId?: string;

  @IsString()
  @IsOptional()
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

  @IsOptional()
  webhookIds?: string[];
}

export class UpdateNotificationRouteDto {
  @IsString()
  @IsOptional()
  @MaxLength(120)
  name?: string;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @IsOptional()
  priority?: number;

  @IsString()
  @IsOptional()
  appId?: string;

  @IsString()
  @IsOptional()
  instanceId?: string;

  @IsString()
  @IsOptional()
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

  @IsOptional()
  webhookIds?: string[];
}

export class CreateNotificationSilenceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @IsString()
  @IsOptional()
  appId?: string;

  @IsString()
  @IsOptional()
  instanceId?: string;

  @IsString()
  @IsOptional()
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

  @IsString()
  @IsOptional()
  timezone?: string;

  @IsOptional()
  daysOfWeek?: number[];

  @IsString()
  @IsNotEmpty()
  startTime!: string;

  @IsString()
  @IsNotEmpty()
  endTime!: string;
}

export class UpdateNotificationSilenceDto {
  @IsString()
  @IsOptional()
  @MaxLength(120)
  name?: string;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @IsString()
  @IsOptional()
  appId?: string;

  @IsString()
  @IsOptional()
  instanceId?: string;

  @IsString()
  @IsOptional()
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

  @IsString()
  @IsOptional()
  timezone?: string;

  @IsOptional()
  daysOfWeek?: number[];

  @IsString()
  @IsOptional()
  startTime?: string;

  @IsString()
  @IsOptional()
  endTime?: string;
}
