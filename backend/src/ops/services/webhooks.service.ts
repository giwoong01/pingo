import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Webhook } from '../entities/webhook.entity';
import {
  CreateNotificationRouteDto,
  CreateNotificationSilenceDto,
  CreateWebhookDto,
  UpdateNotificationRouteDto,
  UpdateNotificationSilenceDto,
  UpdateWebhookDto,
} from '../dto/webhook.dto';
import { NotificationRoute } from '../entities/notification-route.entity';
import { NotificationSilence } from '../entities/notification-silence.entity';

@Injectable()
export class WebhooksService {
  constructor(
    @InjectRepository(Webhook) private readonly repo: Repository<Webhook>,
    @InjectRepository(NotificationRoute) private readonly routeRepo: Repository<NotificationRoute>,
    @InjectRepository(NotificationSilence) private readonly silenceRepo: Repository<NotificationSilence>,
  ) {}

  list(workspaceId?: string) {
    const where = workspaceId ? ({ workspaceId } as any) : undefined;
    return this.repo.find({ where, order: { createdAt: 'DESC' } });
  }

  async get(id: string, workspaceId?: string) {
    const where: any = { id };
    if (workspaceId) where.workspaceId = workspaceId;
    const w = await this.repo.findOne({ where });
    if (!w) throw new NotFoundException('Webhook not found');
    return w;
  }

  async create(dto: CreateWebhookDto, workspaceId: string) {
    const w = this.repo.create({
      workspaceId,
      name: dto.name,
      discordUrl: dto.discordUrl,
      enabled: dto.enabled ?? true,
    });
    return this.repo.save(w);
  }

  async update(id: string, dto: UpdateWebhookDto, workspaceId?: string) {
    const w = await this.get(id, workspaceId);
    if (dto.name !== undefined) w.name = dto.name;
    if (dto.discordUrl !== undefined) w.discordUrl = dto.discordUrl;
    if (dto.enabled !== undefined) w.enabled = dto.enabled;
    return this.repo.save(w);
  }

  async remove(id: string, workspaceId?: string) {
    const w = await this.get(id, workspaceId);
    await this.repo.remove(w);
    return { ok: true };
  }

  listRoutes(workspaceId?: string) {
    const where = workspaceId ? ({ workspaceId } as any) : undefined;
    return this.routeRepo.find({ where, order: { priority: 'ASC', createdAt: 'ASC' } });
  }

  async getRoute(id: string, workspaceId?: string) {
    const where: any = { id };
    if (workspaceId) where.workspaceId = workspaceId;
    const route = await this.routeRepo.findOne({ where });
    if (!route) throw new NotFoundException('Notification route not found');
    return route;
  }

  async createRoute(dto: CreateNotificationRouteDto, workspaceId: string) {
    const route = this.routeRepo.create({
      workspaceId,
      name: String(dto.name || '').trim(),
      enabled: dto.enabled ?? true,
      priority: Number.isFinite(Number(dto.priority)) ? Math.max(1, Number(dto.priority)) : 100,
      appId: String(dto.appId || '').trim() || null,
      instanceId: String(dto.instanceId || '').trim() || null,
      severity: this.normalizeSeverity(dto.severity),
      webhookIds: this.normalizeWebhookIds(dto.webhookIds),
    });
    return this.routeRepo.save(route);
  }

  async updateRoute(id: string, dto: UpdateNotificationRouteDto, workspaceId?: string) {
    const route = await this.getRoute(id, workspaceId);
    if (dto.name !== undefined) route.name = String(dto.name || '').trim();
    if (dto.enabled !== undefined) route.enabled = dto.enabled;
    if (dto.priority !== undefined) route.priority = Number.isFinite(Number(dto.priority)) ? Math.max(1, Number(dto.priority)) : route.priority;
    if (dto.appId !== undefined) route.appId = String(dto.appId || '').trim() || null;
    if (dto.instanceId !== undefined) route.instanceId = String(dto.instanceId || '').trim() || null;
    if (dto.severity !== undefined) route.severity = this.normalizeSeverity(dto.severity);
    if (dto.webhookIds !== undefined) route.webhookIds = this.normalizeWebhookIds(dto.webhookIds);
    return this.routeRepo.save(route);
  }

  async removeRoute(id: string, workspaceId?: string) {
    const route = await this.getRoute(id, workspaceId);
    await this.routeRepo.remove(route);
    return { ok: true };
  }

  listSilences(workspaceId?: string) {
    const where = workspaceId ? ({ workspaceId } as any) : undefined;
    return this.silenceRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  async getSilence(id: string, workspaceId?: string) {
    const where: any = { id };
    if (workspaceId) where.workspaceId = workspaceId;
    const silence = await this.silenceRepo.findOne({ where });
    if (!silence) throw new NotFoundException('Notification silence not found');
    return silence;
  }

  async createSilence(dto: CreateNotificationSilenceDto, workspaceId: string) {
    const silence = this.silenceRepo.create({
      workspaceId,
      name: String(dto.name || '').trim(),
      enabled: dto.enabled ?? true,
      appId: String(dto.appId || '').trim() || null,
      instanceId: String(dto.instanceId || '').trim() || null,
      severity: this.normalizeSeverity(dto.severity),
      timezone: this.normalizeTimezone(dto.timezone),
      daysOfWeek: this.normalizeDaysOfWeek(dto.daysOfWeek),
      startTime: this.normalizeHm(dto.startTime),
      endTime: this.normalizeHm(dto.endTime),
    });
    return this.silenceRepo.save(silence);
  }

  async updateSilence(id: string, dto: UpdateNotificationSilenceDto, workspaceId?: string) {
    const silence = await this.getSilence(id, workspaceId);
    if (dto.name !== undefined) silence.name = String(dto.name || '').trim();
    if (dto.enabled !== undefined) silence.enabled = dto.enabled;
    if (dto.appId !== undefined) silence.appId = String(dto.appId || '').trim() || null;
    if (dto.instanceId !== undefined) silence.instanceId = String(dto.instanceId || '').trim() || null;
    if (dto.severity !== undefined) silence.severity = this.normalizeSeverity(dto.severity);
    if (dto.timezone !== undefined) silence.timezone = this.normalizeTimezone(dto.timezone);
    if (dto.daysOfWeek !== undefined) silence.daysOfWeek = this.normalizeDaysOfWeek(dto.daysOfWeek);
    if (dto.startTime !== undefined) silence.startTime = this.normalizeHm(dto.startTime);
    if (dto.endTime !== undefined) silence.endTime = this.normalizeHm(dto.endTime);
    return this.silenceRepo.save(silence);
  }

  async removeSilence(id: string, workspaceId?: string) {
    const silence = await this.getSilence(id, workspaceId);
    await this.silenceRepo.remove(silence);
    return { ok: true };
  }

  private normalizeSeverity(severity?: string | null): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | null {
    const s = String(severity || '').trim().toUpperCase();
    if (!s) return null;
    if (s === 'LOW' || s === 'MEDIUM' || s === 'HIGH' || s === 'CRITICAL') return s;
    return null;
  }

  private normalizeWebhookIds(ids?: string[] | null): string[] {
    if (!Array.isArray(ids)) return [];
    return Array.from(
      new Set(
        ids
          .map((x) => String(x || '').trim())
          .filter(Boolean),
      ),
    );
  }

  private normalizeTimezone(timezone?: string | null): string {
    const tz = String(timezone || '').trim();
    return tz || 'UTC';
  }

  private normalizeDaysOfWeek(days?: number[] | null): number[] {
    if (!Array.isArray(days)) return [];
    const filtered = Array.from(
      new Set(
        days
          .map((x) => Number(x))
          .filter((x) => Number.isInteger(x) && x >= 0 && x <= 6),
      ),
    );
    return filtered.sort((a, b) => a - b);
  }

  private normalizeHm(hm?: string | null): string {
    const raw = String(hm || '').trim();
    const m = raw.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
    if (!m) return '00:00';
    return `${m[1]}:${m[2]}`;
  }
}
