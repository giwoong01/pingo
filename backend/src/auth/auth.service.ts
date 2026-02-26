import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { DataSource, In, Repository } from 'typeorm';
import { randomBytes, createHmac, scryptSync, timingSafeEqual } from 'crypto';
import { User } from './entities/user.entity';
import { Workspace } from './entities/workspace.entity';
import { WorkspaceMember, WorkspaceRole } from './entities/workspace-member.entity';
import { WorkspaceInvite } from './entities/workspace-invite.entity';
import {
  AcceptInviteDto,
  CreateInviteLinkDto,
  CreateWorkspaceDto,
  InviteWorkspaceMemberDto,
  ListInviteLinksQueryDto,
  LoginDto,
  RegisterDto,
  SwitchWorkspaceDto,
  UpdateWorkspaceMemberRoleDto,
} from './dto/auth.dto';

export type AccessTokenPayload = {
  uid: string;
  wid: string;
  role: WorkspaceRole;
  exp: number;
};

export type AuthContext = {
  userId: string;
  email: string;
  workspaceId: string;
  role: WorkspaceRole;
};

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Workspace) private readonly workspaceRepo: Repository<Workspace>,
    @InjectRepository(WorkspaceMember) private readonly memberRepo: Repository<WorkspaceMember>,
    @InjectRepository(WorkspaceInvite) private readonly inviteRepo: Repository<WorkspaceInvite>,
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
  ) {}

  async register(dto: RegisterDto) {
    const email = this.normalizeEmail(dto.email);
    const existing = await this.userRepo.findOne({ where: { email } });
    if (existing) throw new BadRequestException('Email already in use');

    const hasUsers = (await this.userRepo.count()) > 0;
    const user = await this.userRepo.save(
      this.userRepo.create({
        email,
        name: String(dto.name || '').trim() || null,
        passwordHash: this.hashPassword(dto.password),
        enabled: true,
      }),
    );

    const workspaceName = String(dto.workspaceName || '').trim() || `${(user.name || email.split('@')[0] || 'User').slice(0, 32)} Workspace`;
    const workspace = await this.workspaceRepo.save(
      this.workspaceRepo.create({
        name: workspaceName,
        slug: await this.generateWorkspaceSlug(workspaceName),
      }),
    );

    await this.memberRepo.save(
      this.memberRepo.create({
        workspaceId: workspace.id,
        userId: user.id,
        role: 'OWNER',
      }),
    );

    if (!hasUsers) {
      await this.claimLegacyOpsData(workspace.id);
    }

    return this.buildAuthResponse(user, workspace.id, 'OWNER');
  }

  async login(dto: LoginDto) {
    const email = this.normalizeEmail(dto.email);
    const user = await this.userRepo.findOne({ where: { email } });
    if (!user || !user.enabled) throw new UnauthorizedException('Invalid email or password');
    if (!this.verifyPassword(dto.password, user.passwordHash)) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const membership = await this.memberRepo.findOne({ where: { userId: user.id }, order: { createdAt: 'ASC' } });
    if (!membership) throw new UnauthorizedException('No workspace membership found');

    return this.buildAuthResponse(user, membership.workspaceId, membership.role);
  }

  async me(ctx: AuthContext) {
    const user = await this.userRepo.findOne({ where: { id: ctx.userId, enabled: true } });
    if (!user) throw new UnauthorizedException('User not found');

    const [membership, workspace, memberships] = await Promise.all([
      this.memberRepo.findOne({ where: { userId: user.id, workspaceId: ctx.workspaceId } }),
      this.workspaceRepo.findOne({ where: { id: ctx.workspaceId } }),
      this.memberRepo.find({ where: { userId: user.id }, order: { createdAt: 'ASC' } }),
    ]);
    if (!membership || !workspace) throw new UnauthorizedException('Workspace not found');

    const workspaceIds = memberships.map((m) => m.workspaceId);
    const workspaces = workspaceIds.length ? await this.workspaceRepo.find({ where: { id: In(workspaceIds) } }) : [];
    const workspaceById = new Map(workspaces.map((w) => [w.id, w]));
    const membershipByWorkspaceId = new Map(memberships.map((m) => [m.workspaceId, m]));

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      workspace: {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
      },
      membership: {
        role: membership.role,
      },
      workspaces: memberships
        .map((m) => {
          const w = workspaceById.get(m.workspaceId);
          if (!w) return null;
          return {
            id: w.id,
            name: w.name,
            slug: w.slug,
            role: membershipByWorkspaceId.get(w.id)?.role || 'MEMBER',
          };
        })
        .filter((x) => Boolean(x)),
    };
  }

  async listWorkspaces(ctx: AuthContext) {
    const user = await this.userRepo.findOne({ where: { id: ctx.userId, enabled: true } });
    if (!user) throw new UnauthorizedException('User not found');

    const memberships = await this.memberRepo.find({ where: { userId: user.id }, order: { createdAt: 'ASC' } });
    const workspaceIds = memberships.map((m) => m.workspaceId);
    if (workspaceIds.length === 0) return [];
    const workspaces = await this.workspaceRepo.find({ where: { id: In(workspaceIds) } });
    const workspaceById = new Map(workspaces.map((w) => [w.id, w]));

    return memberships
      .map((m) => {
        const w = workspaceById.get(m.workspaceId);
        if (!w) return null;
        return {
          id: w.id,
          name: w.name,
          slug: w.slug,
          role: m.role,
          isCurrent: w.id === ctx.workspaceId,
        };
      })
      .filter((x) => Boolean(x));
  }

  async createWorkspace(ctx: AuthContext, dto: CreateWorkspaceDto) {
    const user = await this.userRepo.findOne({ where: { id: ctx.userId, enabled: true } });
    if (!user) throw new UnauthorizedException('User not found');
    const name = String(dto.name || '').trim();
    if (!name) throw new BadRequestException('Workspace name is required');

    const workspace = await this.workspaceRepo.save(
      this.workspaceRepo.create({
        slug: await this.generateWorkspaceSlug(name),
      }),
    );

    const membership = await this.memberRepo.save(
      this.memberRepo.create({
        workspaceId: workspace.id,
        userId: user.id,
        role: 'OWNER',
      }),
    );

    return this.buildAuthResponse(user, workspace.id, membership.role);
  }

  async switchWorkspace(ctx: AuthContext, dto: SwitchWorkspaceDto) {
    const user = await this.userRepo.findOne({ where: { id: ctx.userId, enabled: true } });
    if (!user) throw new UnauthorizedException('User not found');

    const workspaceId = String(dto.workspaceId || '').trim();
    if (!workspaceId) throw new BadRequestException('workspaceId is required');

    const membership = await this.memberRepo.findOne({ where: { userId: user.id, workspaceId } });
    if (!membership) throw new UnauthorizedException('No membership for target workspace');

    return this.buildAuthResponse(user, workspaceId, membership.role);
  }

  async listWorkspaceMembers(ctx: AuthContext, workspaceId: string) {
    this.assertWorkspaceScope(ctx, workspaceId);
    const rows = await this.memberRepo.find({
      where: { workspaceId },
      relations: ['user'],
      order: { createdAt: 'ASC' },
    });
    return rows.map((m) => ({
      userId: m.userId,
      email: m.user?.email || '',
      name: m.user?.name || null,
      role: m.role,
      createdAt: m.createdAt,
      isMe: m.userId === ctx.userId,
    }));
  }

  async inviteWorkspaceMember(ctx: AuthContext, workspaceId: string, dto: InviteWorkspaceMemberDto) {
    await this.assertOwnerRole(ctx, workspaceId);
    const email = this.normalizeEmail(dto.email);
    const role = this.normalizeRole(dto.role);
    const user = await this.userRepo.findOne({ where: { email, enabled: true } });
    if (!user) throw new BadRequestException('User not found. User must register first.');
    const exists = await this.memberRepo.findOne({ where: { workspaceId, userId: user.id } });
    if (exists) throw new BadRequestException('User is already a workspace member');

    const created = await this.memberRepo.save(
      this.memberRepo.create({
        userId: user.id,
      }),
    );

    return {
      ok: true,
      member: {
        userId: created.userId,
        email: user.email,
        name: user.name,
        role: created.role,
      },
    };
  }

  async updateWorkspaceMemberRole(ctx: AuthContext, workspaceId: string, userId: string, dto: UpdateWorkspaceMemberRoleDto) {
    await this.assertOwnerRole(ctx, workspaceId);
    const role = this.normalizeRole(dto.role);
    const member = await this.memberRepo.findOne({ where: { workspaceId, userId } });
    if (!member) throw new BadRequestException('Workspace member not found');

    if (member.userId === ctx.userId && member.role === 'OWNER' && role !== 'OWNER') {
      throw new BadRequestException('Owner cannot downgrade own role');
    }
    if (member.role === 'OWNER' && role !== 'OWNER') {
      const ownerCount = await this.memberRepo.count({ where: { workspaceId, role: 'OWNER' } as any });
      if (ownerCount <= 1) throw new BadRequestException('At least one OWNER must remain');
    }

    member.role = role;
    await this.memberRepo.save(member);
    return { ok: true };
  }

  async removeWorkspaceMember(ctx: AuthContext, workspaceId: string, userId: string) {
    await this.assertOwnerRole(ctx, workspaceId);
    if (userId === ctx.userId) throw new BadRequestException('Owner cannot remove self');
    const member = await this.memberRepo.findOne({ where: { workspaceId, userId } });
    if (!member) throw new BadRequestException('Workspace member not found');
    if (member.role === 'OWNER') {
      const ownerCount = await this.memberRepo.count({ where: { workspaceId, role: 'OWNER' } as any });
      if (ownerCount <= 1) throw new BadRequestException('At least one OWNER must remain');
    }
    await this.memberRepo.remove(member);
    return { ok: true };
  }

  async createInviteLink(ctx: AuthContext, workspaceId: string, dto: CreateInviteLinkDto) {
    await this.assertOwnerRole(ctx, workspaceId);
    const workspace = await this.workspaceRepo.findOne({ where: { id: workspaceId } });
    if (!workspace) throw new BadRequestException('Workspace not found');

    const invitedEmail = dto.email ? this.normalizeEmail(dto.email) : null;
    const role = this.normalizeRole(dto.role);
    const expiresInHours = Math.min(Math.max(Number(dto.expiresInHours || 72), 1), 24 * 14);
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);
    const token = randomBytes(24).toString('base64url');

    const invite = await this.inviteRepo.save(
      this.inviteRepo.create({
        createdByUserId: ctx.userId,
        acceptedByUserId: null,
        acceptedAt: null,
        revokedAt: null,
      }),
    );

    const frontendBase = this.config.get<string>('FRONTEND_URL', 'http://localhost:3001');
    const acceptUrl = `${frontendBase.replace(/\/$/, '')}/auth/accept-invite?token=${encodeURIComponent(invite.token)}`;

    return {
      id: invite.id,
      token: invite.token,
      workspaceName: workspace.name,
      role: invite.role,
      invitedEmail: invite.invitedEmail,
      expiresAt: invite.expiresAt,
    };
  }

  async getInviteByToken(token: string) {
    const invite = await this.getInviteOrThrow(token);
    const status = this.getInviteStatus(invite);
    return {
      id: invite.id,
      token: invite.token,
      role: invite.role,
      invitedEmail: invite.invitedEmail,
      workspace: {
        id: invite.workspaceId,
        name: invite.workspace?.name || null,
        slug: invite.workspace?.slug || null,
      },
      expiresAt: invite.expiresAt,
      acceptedAt: invite.acceptedAt,
      revokedAt: invite.revokedAt,
    };
  }

  async acceptInvite(dto: AcceptInviteDto) {
    const invite = await this.getInviteOrThrow(dto.token);
    this.assertInviteActive(invite);

    const email = this.normalizeEmail(dto.email);
    if (invite.invitedEmail && invite.invitedEmail !== email) {
      throw new UnauthorizedException('Invite email does not match');
    }

    let user = await this.userRepo.findOne({ where: { email } });
    if (!user) {
      user = await this.userRepo.save(
        this.userRepo.create({
          name: String(dto.name || '').trim() || null,
          passwordHash: this.hashPassword(dto.password),
          enabled: true,
        }),
      );
    } else {
      if (!user.enabled) throw new UnauthorizedException('User is disabled');
      if (!this.verifyPassword(dto.password, user.passwordHash)) {
        throw new UnauthorizedException('Invalid email or password');
      }
    }

    let membership = await this.memberRepo.findOne({ where: { workspaceId: invite.workspaceId, userId: user.id } });
    if (!membership) {
      membership = await this.memberRepo.save(
        this.memberRepo.create({
          workspaceId: invite.workspaceId,
          userId: user.id,
          role: invite.role,
        }),
      );
    }

    invite.acceptedAt = new Date();
    invite.acceptedByUserId = user.id;
    await this.inviteRepo.save(invite);

    return this.buildAuthResponse(user, invite.workspaceId, membership.role);
  }

  async listInviteLinks(ctx: AuthContext, workspaceId: string, query: ListInviteLinksQueryDto) {
    await this.assertOwnerRole(ctx, workspaceId);
    const rows = await this.inviteRepo.find({
      where: { workspaceId },
      order: { createdAt: 'DESC' },
      take: 200,
    });
    const emailFilter = String(query.email || '').trim().toLowerCase();
    const statusFilter = String(query.status || '').trim().toUpperCase();

    return rows
      .map((r) => {
        const status = this.getInviteStatus(r);
        return {
          id: r.id,
          token: r.token,
          status,
          role: r.role,
          invitedEmail: r.invitedEmail,
          createdByUserId: r.createdByUserId,
          acceptedByUserId: r.acceptedByUserId,
          createdAt: r.createdAt,
          expiresAt: r.expiresAt,
          acceptedAt: r.acceptedAt,
          revokedAt: r.revokedAt,
        };
      })
      .filter((r) => (emailFilter ? String(r.invitedEmail || '').toLowerCase().includes(emailFilter) : true))
      .filter((r) => (statusFilter ? r.status === statusFilter : true));
  }

  async revokeInviteLink(ctx: AuthContext, workspaceId: string, inviteId: string) {
    await this.assertOwnerRole(ctx, workspaceId);
    const invite = await this.inviteRepo.findOne({ where: { id: inviteId, workspaceId } });
    if (!invite) throw new BadRequestException('Invite not found');
    if (invite.revokedAt) return { ok: true };
    if (invite.acceptedAt) throw new BadRequestException('Accepted invite cannot be revoked');
    invite.revokedAt = new Date();
    await this.inviteRepo.save(invite);
    return { ok: true };
  }

  async verifyAccessToken(token: string): Promise<AuthContext> {
    const payload = this.parseAndVerifyToken(token);
    if (payload.exp <= Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException('Token expired');
    }

    const user = await this.userRepo.findOne({ where: { id: payload.uid, enabled: true } });
    if (!user) throw new UnauthorizedException('User not found');

    const membership = await this.memberRepo.findOne({
      where: { userId: user.id, workspaceId: payload.wid },
    });
    if (!membership) throw new UnauthorizedException('Membership not found');

    return {
      userId: user.id,
      email: user.email,
      workspaceId: membership.workspaceId,
      role: membership.role,
    };
  }

  private buildAuthResponse(user: User, workspaceId: string, role: WorkspaceRole) {
    const token = this.issueAccessToken({
      uid: user.id,
      wid: workspaceId,
      role,
      exp: Math.floor(Date.now() / 1000) + this.getTokenTtlSec(),
    });

    return {
      accessToken: token,
      tokenType: 'Bearer',
      expiresInSec: this.getTokenTtlSec(),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      workspace: {
        id: workspaceId,
      },
      membership: {
        role,
      },
    };
  }

  private getSecret(): string {
    return this.config.get<string>('AUTH_SECRET', 'local-dev-auth-secret-change-me');
  }

  private getTokenTtlSec(): number {
    const v = Number(this.config.get<string>('AUTH_TOKEN_TTL_SEC', '604800'));
    if (!Number.isFinite(v) || v <= 60) return 604800;
    return Math.floor(v);
  }

  private issueAccessToken(payload: AccessTokenPayload): string {
    const encoded = this.base64UrlEncode(JSON.stringify(payload));
    const sig = this.sign(encoded);
    return `${encoded}.${sig}`;
  }

  private parseAndVerifyToken(token: string): AccessTokenPayload {
    const raw = String(token || '').trim();
    const [encoded, sig] = raw.split('.');
    if (!encoded || !sig) throw new UnauthorizedException('Invalid token');
    const expected = this.sign(encoded);
    const sigBuf = Buffer.from(sig);
    const expectedBuf = Buffer.from(expected);
    if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
      throw new UnauthorizedException('Invalid token signature');
    }

    try {
      const payload = JSON.parse(this.base64UrlDecode(encoded));
      return payload as AccessTokenPayload;
    } catch {
      throw new UnauthorizedException('Invalid token payload');
    }
  }

  private sign(message: string): string {
    return createHmac('sha256', this.getSecret()).update(message).digest('base64url');
  }

  private normalizeEmail(email: string): string {
    return String(email || '').trim().toLowerCase();
  }

  private normalizeRole(role?: string): WorkspaceRole {
    const upper = String(role || 'MEMBER').trim().toUpperCase();
    if (upper === 'OWNER' || upper === 'ADMIN' || upper === 'MEMBER') return upper as WorkspaceRole;
    throw new BadRequestException('role must be one of OWNER, ADMIN, MEMBER');
  }

  private assertWorkspaceScope(ctx: AuthContext, workspaceId: string) {
    const wid = String(workspaceId || '').trim();
    if (!wid) throw new BadRequestException('workspaceId is required');
    if (wid !== ctx.workspaceId) {
      throw new UnauthorizedException('Switch to target workspace first');
    }
  }

  private async assertOwnerRole(ctx: AuthContext, workspaceId: string) {
    this.assertWorkspaceScope(ctx, workspaceId);
    const me = await this.memberRepo.findOne({ where: { workspaceId, userId: ctx.userId } });
    if (!me) throw new UnauthorizedException('Not a workspace member');
    if (me.role !== 'OWNER') throw new UnauthorizedException('Only OWNER can manage workspace members');
  }

  private async getInviteOrThrow(token: string) {
    const t = String(token || '').trim();
    if (!t) throw new BadRequestException('token is required');
    const invite = await this.inviteRepo.findOne({ where: { token: t }, relations: ['workspace'] });
    if (!invite) throw new BadRequestException('Invite not found');
    return invite;
  }

  private getInviteStatus(invite: WorkspaceInvite): 'VALID' | 'EXPIRED' | 'ACCEPTED' | 'REVOKED' {
    if (invite.revokedAt) return 'REVOKED';
    if (invite.acceptedAt) return 'ACCEPTED';
    if (invite.expiresAt.getTime() <= Date.now()) return 'EXPIRED';
    return 'VALID';
  }

  private assertInviteActive(invite: WorkspaceInvite) {
    const status = this.getInviteStatus(invite);
    if (status === 'REVOKED') throw new BadRequestException('Invite revoked');
    if (status === 'ACCEPTED') throw new BadRequestException('Invite already accepted');
    if (status === 'EXPIRED') throw new BadRequestException('Invite expired');
  }

  private hashPassword(password: string): string {
    const salt = randomBytes(16).toString('hex');
    const hash = scryptSync(password, salt, 64).toString('hex');
    return `scrypt:${salt}:${hash}`;
  }

  private verifyPassword(password: string, stored: string): boolean {
    const [algo, salt, expectedHash] = String(stored || '').split(':');
    if (algo !== 'scrypt' || !salt || !expectedHash) return false;
    const actualHash = scryptSync(password, salt, 64).toString('hex');
    const expected = Buffer.from(expectedHash, 'hex');
    const actual = Buffer.from(actualHash, 'hex');
    if (expected.length !== actual.length) return false;
    return timingSafeEqual(expected, actual);
  }

  private base64UrlEncode(input: string): string {
    return Buffer.from(input, 'utf8').toString('base64url');
  }

  private base64UrlDecode(input: string): string {
    return Buffer.from(input, 'base64url').toString('utf8');
  }

  private async generateWorkspaceSlug(name: string): Promise<string> {
    const base = String(name || 'workspace')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'workspace';

    let slug = base;
    let i = 1;
    while (await this.workspaceRepo.findOne({ where: { slug } })) {
      slug = `${base}-${i}`;
      i += 1;
    }
    return slug;
  }

  private async claimLegacyOpsData(workspaceId: string) {
    const tableNames = ['clusters', 'apps', 'instances', 'rules', 'webhooks', 'rule_states', 'alert_events'];
    for (const table of tableNames) {
      await this.dataSource
        .createQueryBuilder()
        .update(table)
        .set({ workspaceId } as any)
        .where(`\"workspaceId\" IS NULL`)
        .execute();
    }
  }
}
