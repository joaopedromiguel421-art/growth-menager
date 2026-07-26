import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { AuthorizationService } from "./auth.service.js";
import { DashboardController } from "./dashboard.controller.js";
import { DashboardService } from "./dashboard.service.js";
import { databaseProvider } from "./database.provider.js";
import { DomainExceptionFilter } from "./domain-exception.filter.js";
import { HealthController } from "./health.controller.js";
import { IdentityController } from "./identity.controller.js";
import { IdentityService } from "./identity.service.js";
import { IntegrationsController } from "./integrations.controller.js";
import { IntegrationsService } from "./integrations.service.js";
import { JwtAuthGuard } from "./jwt-auth.guard.js";
import { WorkController } from "./work.controller.js";
import { WorkService } from "./work.service.js";
import { WebhookController } from "./webhook.controller.js";
import { WebhookService } from "./webhook.service.js";

@Module({
  controllers: [
    HealthController,
    IdentityController,
    DashboardController,
    IntegrationsController,
    WorkController,
    WebhookController
  ],
  providers: [
    databaseProvider,
    AuthorizationService,
    IdentityService,
    IntegrationsService,
    DashboardService,
    WorkService,
    WebhookService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_FILTER, useClass: DomainExceptionFilter }
  ]
})
// Nest discovers module metadata from the decorator.
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class AppModule {}
