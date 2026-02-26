import { IsEmail, IsInt, IsOptional, IsString, MaxLength, Min, MinLength, Max } from 'class-validator';
import { WorkspaceRole } from '../entities/workspace-member.entity';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(120)
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  workspaceName?: string;
}

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(120)
  password!: string;
}

export class CreateWorkspaceDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;
}

export class SwitchWorkspaceDto {
  @IsString()
  workspaceId!: string;
}

export class InviteWorkspaceMemberDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  role?: WorkspaceRole;
}

export class UpdateWorkspaceMemberRoleDto {
  @IsString()
  role!: WorkspaceRole;
}

export class CreateInviteLinkDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  role?: WorkspaceRole;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24 * 14)
  expiresInHours?: number;
}

export class AcceptInviteDto {
  @IsString()
  token!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(120)
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;
}

export class ListInviteLinksQueryDto {
  @IsOptional()
  @IsString()
  status?: 'VALID' | 'EXPIRED' | 'ACCEPTED' | 'REVOKED';

  @IsOptional()
  @IsString()
  email?: string;
}
