import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { Cluster } from './entities/cluster.entity';
import { App } from './entities/app.entity';
import { Rule } from './entities/rule.entity';
import { RuleState } from './entities/rule-state.entity';
import { Webhook } from './entities/webhook.entity';
import { AlertEvent } from './entities/alert-event.entity';
import { RuleWebhook } from './entities/rule-webhook.entity';
import { ClustersController } from './http/clusters.controller';
import { AppsController } from './http/apps.controller';
import { InstancesController } from './http/instances.controller';
import { RulesController } from './http/rules.controller';
import { WebhooksController } from './http/webhooks.controller';
import { AlertsController } from './http/alerts.controller';
import { OpsConfigController } from './http/ops-config.controller';
import { ClustersService } from './services/clusters.service';
import { AppsService } from './services/apps.service';
import { InstancesService } from './services/instances.service';
import { RulesService } from './services/rules.service';
import { WebhooksService } from './services/webhooks.service';
import { AlertsService } from './services/alerts.service';
import { PrometheusService } from './services/prometheus.service';
import { CryptoService } from './services/crypto.service';
import { DiscordService } from './services/discord.service';
import { AiService } from './services/ai.service';
import { AlertEngineService } from './services/alert-engine.service';
import { OpsConfigService } from './services/ops-config.service';
import { PresetsService } from './services/presets.service';
import { PresetsController } from './http/presets.controller';
import { AppMetricsService } from './services/app-metrics.service';
import { RuleStatesService } from './services/rule-states.service';
import { RuleStatesController } from './http/rule-states.controller';
import { AppHealthService } from './services/app-health.service';
import { Instance } from './entities/instance.entity';
import { NotificationRoute } from './entities/notification-route.entity';
import { NotificationSilence } from './entities/notification-silence.entity';

@Module({
  imports: [
    ConfigModule,
    HttpModule,
    TypeOrmModule.forFeature([
      Cluster,
      App,
      Instance,
      Rule,
      RuleState,
      Webhook,
      RuleWebhook,
      AlertEvent,
      NotificationRoute,
      NotificationSilence,
    ]),
  ],
  controllers: [
    ClustersController,
    AppsController,
    InstancesController,
    PresetsController,
    RulesController,
    RuleStatesController,
    WebhooksController,
    AlertsController,
    OpsConfigController,
  ],
  providers: [
    CryptoService,
    PrometheusService,
    ClustersService,
    AppsService,
    InstancesService,
    AppMetricsService,
    AppHealthService,
    PresetsService,
    RulesService,
    WebhooksService,
    DiscordService,
    AiService,
    AlertsService,
    RuleStatesService,
    AlertEngineService,
    OpsConfigService,
  ],
})
export class OpsModule {}
