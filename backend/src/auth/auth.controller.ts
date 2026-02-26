import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { AuthService } from './auth.service';
import {
  AcceptInviteDto,
  CreateInviteLinkDto,
  CreateWorkspaceDto,
  InviteWorkspaceMemberDto,
  LoginDto,
  RegisterDto,
  SwitchWorkspaceDto,
  UpdateWorkspaceMemberRoleDto,
  ListInviteLinksQueryDto,
} from './dto/auth.dto';
import { Public } from './decorators/public.decorator';
import { CurrentAuth } from './decorators/current-auth.decorator';

@Controller('api/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Get('me')
  me(@CurrentAuth() ctx: any) {
    return this.auth.me(ctx);
  }

  @Get('workspaces')
  workspaces(@CurrentAuth() ctx: any) {
    return this.auth.listWorkspaces(ctx);
  }

  @Post('workspaces')
  createWorkspace(@CurrentAuth() ctx: any, @Body() dto: CreateWorkspaceDto) {
    return this.auth.createWorkspace(ctx, dto);
  }

  @Post('switch-workspace')
  switchWorkspace(@CurrentAuth() ctx: any, @Body() dto: SwitchWorkspaceDto) {
    return this.auth.switchWorkspace(ctx, dto);
  }

  @Post('workspaces/:workspaceId/invite-link')
  createInviteLink(@CurrentAuth() ctx: any, @Param('workspaceId') workspaceId: string, @Body() dto: CreateInviteLinkDto) {
    return this.auth.createInviteLink(ctx, workspaceId, dto);
  }

  @Get('workspaces/:workspaceId/invite-links')
  listInviteLinks(
    @CurrentAuth() ctx: any,
    @Param('workspaceId') workspaceId: string,
    @Query() query: ListInviteLinksQueryDto,
  ) {
    return this.auth.listInviteLinks(ctx, workspaceId, query);
  }

  @Get('workspaces/:workspaceId/members')
  listMembers(@CurrentAuth() ctx: any, @Param('workspaceId') workspaceId: string) {
    return this.auth.listWorkspaceMembers(ctx, workspaceId);
  }

  @Post('workspaces/:workspaceId/invite')
  inviteMember(@CurrentAuth() ctx: any, @Param('workspaceId') workspaceId: string, @Body() dto: InviteWorkspaceMemberDto) {
    return this.auth.inviteWorkspaceMember(ctx, workspaceId, dto);
  }

  @Patch('workspaces/:workspaceId/members/:userId')
  updateMemberRole(
    @CurrentAuth() ctx: any,
    @Param('workspaceId') workspaceId: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateWorkspaceMemberRoleDto,
  ) {
    return this.auth.updateWorkspaceMemberRole(ctx, workspaceId, userId, dto);
  }

  @Delete('workspaces/:workspaceId/members/:userId')
  removeMember(@CurrentAuth() ctx: any, @Param('workspaceId') workspaceId: string, @Param('userId') userId: string) {
    return this.auth.removeWorkspaceMember(ctx, workspaceId, userId);
  }

  @Delete('workspaces/:workspaceId/invite-links/:inviteId')
  revokeInviteLink(@CurrentAuth() ctx: any, @Param('workspaceId') workspaceId: string, @Param('inviteId') inviteId: string) {
    return this.auth.revokeInviteLink(ctx, workspaceId, inviteId);
  }

  @Public()
  @Get('invites/:token')
  getInvite(@Param('token') token: string) {
    return this.auth.getInviteByToken(token);
  }

  @Public()
  @Post('accept-invite')
  acceptInvite(@Body() dto: AcceptInviteDto) {
    return this.auth.acceptInvite(dto);
  }
}
