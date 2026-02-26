import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class CreateClusterDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @IsUrl({ require_tld: false })
  prometheusUrl!: string;

  @IsString()
  @IsOptional()
  bearerToken?: string;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;
}

export class UpdateClusterDto {
  @IsString()
  @IsOptional()
  @MaxLength(120)
  name?: string;

  @IsString()
  @IsOptional()
  @IsUrl({ require_tld: false })
  prometheusUrl?: string;

  @IsString()
  @IsOptional()
  bearerToken?: string;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;
}

