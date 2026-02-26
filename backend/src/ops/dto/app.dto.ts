import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateAppDto {
  @IsUUID()
  clusterId!: string;

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
  @MaxLength(200)
  job!: string;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;
}

export class UpdateAppDto {
  @IsUUID()
  @IsOptional()
  clusterId?: string;

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
  @MaxLength(200)
  job?: string;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;
}
