import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AlertEvent } from '../entities/alert-event.entity';

type AlertListOptions = {
  workspaceId?: string;
  limit?: number;
  appId?: string;
  instanceId?: string;
  from?: Date | null;
  to?: Date | null;
};

@Injectable()
export class AlertsService {
  constructor(@InjectRepository(AlertEvent) private readonly repo: Repository<AlertEvent>) {}

  list(opts: AlertListOptions = {}) {
    const limit = Math.min(Math.max(1, Number(opts.limit || 100)), 500);
    const qb = this.repo
      .createQueryBuilder('e')
      .innerJoin('rules', 'r', 'r.id = e.ruleId')
      .orderBy('e.createdAt', 'DESC')
      .take(limit);

    if (opts.workspaceId) qb.andWhere('e.workspaceId = :workspaceId', { workspaceId: opts.workspaceId });
    if (opts.appId) qb.andWhere('e.appId = :appId', { appId: opts.appId });
    if (opts.instanceId) qb.andWhere('r.instanceId = :instanceId', { instanceId: opts.instanceId });
    if (opts.from) qb.andWhere('e.createdAt >= :from', { from: opts.from.toISOString() });
    if (opts.to) qb.andWhere('e.createdAt <= :to', { to: opts.to.toISOString() });

    return qb.getMany();
  }
}
