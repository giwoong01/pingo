import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RuleState } from '../entities/rule-state.entity';

@Injectable()
export class RuleStatesService {
  constructor(@InjectRepository(RuleState) private readonly repo: Repository<RuleState>) {}

  async list(workspaceId?: string, appId?: string) {
    const qb = this.repo
      .createQueryBuilder('s')
      .innerJoin('rules', 'r', 'r.id = s.ruleId')
      .select([
        's.ruleId AS "ruleId"',
        's.state AS "state"',
        's.pendingSince AS "pendingSince"',
        's.firingSince AS "firingSince"',
        's.lastSentAt AS "lastSentAt"',
        's.lastEvalAt AS "lastEvalAt"',
        's.lastEvalOk AS "lastEvalOk"',
        's.lastEvalError AS "lastEvalError"',
        's.lastEvalCategory AS "lastEvalCategory"',
        's.lastValue AS "lastValue"',
        'r.appId AS "appId"',
      ]);

    if (workspaceId) qb.where('s.workspaceId = :workspaceId', { workspaceId });
    if (appId) qb.andWhere('r.appId = :appId', { appId });
    qb.orderBy('s.updatedAt', 'DESC');

    return qb.getRawMany();
  }
}
