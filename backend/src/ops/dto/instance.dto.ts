import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateInstanceDto {
  @IsUUID()
  clusterId!: string;

  @IsUUID()
  @IsOptional()
  appId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name!: string;

  @IsString()
  @IsOptional()
  @MaxLength(120)
  owner?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  provider!: string;

  @IsString()
  @IsOptional()
  @MaxLength(80)
  publicIp?: string;

  @IsString()
  @IsOptional()
  @MaxLength(80)
  privateIp?: string;

  @IsString()
  @IsOptional()
  @MaxLength(80)
  region?: string;

  @IsString()
  @IsOptional()
  @MaxLength(60)
  env?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  prometheusInstance!: string;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;
}

export class UpdateInstanceDto {
  @IsUUID()
  @IsOptional()
  clusterId?: string;

  @IsUUID()
  @IsOptional()
  appId?: string;

  @IsString()
  @IsOptional()
  @MaxLength(160)
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(120)
  owner?: string;

  @IsString()
  @IsOptional()
  @MaxLength(32)
  provider?: string;

  @IsString()
  @IsOptional()
  @MaxLength(80)
  publicIp?: string;

  @IsString()
  @IsOptional()
  @MaxLength(80)
  privateIp?: string;

  @IsString()
  @IsOptional()
  @MaxLength(80)
  region?: string;

  @IsString()
  @IsOptional()
  @MaxLength(60)
  env?: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  prometheusInstance?: string;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;
}
