import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import {
  alertUpdateSchema,
  brandKitUpsertSchema,
  budgetUpsertSchema,
  contentCreateSchema,
  contentUpdateSchema,
  publicationCreateSchema,
  publicationUpdateSchema,
  reportCreateSchema,
  reportDeliveryRequestSchema
} from "@growth-manager/contracts";
import { DomainError, type TenantContext } from "@growth-manager/domain";
import { requireIdempotencyKey } from "./idempotency.js";
import type { AuthenticatedRequest } from "./request-context.js";
import { OperationsService } from "./operations.service.js";

@ApiTags("operations")
@ApiBearerAuth()
@Controller("v1/tenants/:tenantId")
export class OperationsController {
  public constructor(private readonly operations: OperationsService) {}

  @Get("alerts")
  public listAlerts(@Req() request: AuthenticatedRequest): Promise<unknown> {
    return this.operations.listAlerts(this.context(request));
  }

  @Patch("alerts/:alertId")
  public updateAlert(
    @Req() request: AuthenticatedRequest,
    @Param("alertId") alertId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown
  ): Promise<unknown> {
    return this.operations.updateAlert(
      this.context(request),
      alertId,
      requireIdempotencyKey(key),
      alertUpdateSchema.parse(body)
    );
  }

  @Get("costs")
  public getCosts(
    @Req() request: AuthenticatedRequest,
    @Query("month") month?: string
  ): Promise<unknown> {
    if (month !== undefined && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      throw new DomainError("GM-COSTS-PERIOD", "Informe o mês no formato AAAA-MM.", false);
    }
    return this.operations.getCosts(this.context(request), month);
  }

  @Put("budgets")
  public upsertBudget(
    @Req() request: AuthenticatedRequest,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown
  ): Promise<unknown> {
    return this.operations.upsertBudget(
      this.context(request),
      requireIdempotencyKey(key),
      budgetUpsertSchema.parse(body)
    );
  }

  @Get("brand-kit")
  public getBrandKit(@Req() request: AuthenticatedRequest): Promise<unknown> {
    return this.operations.getBrandKit(this.context(request));
  }

  @Put("brand-kit")
  public upsertBrandKit(
    @Req() request: AuthenticatedRequest,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown
  ): Promise<unknown> {
    return this.operations.upsertBrandKit(
      this.context(request),
      requireIdempotencyKey(key),
      brandKitUpsertSchema.parse(body)
    );
  }

  @Get("content")
  public listContent(@Req() request: AuthenticatedRequest): Promise<unknown> {
    return this.operations.listContent(this.context(request));
  }

  @Post("content")
  public createContent(
    @Req() request: AuthenticatedRequest,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown
  ): Promise<unknown> {
    return this.operations.createContent(
      this.context(request),
      requireIdempotencyKey(key),
      contentCreateSchema.parse(body)
    );
  }

  @Patch("content/:contentId")
  public updateContent(
    @Req() request: AuthenticatedRequest,
    @Param("contentId") contentId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown
  ): Promise<unknown> {
    return this.operations.updateContent(
      this.context(request),
      contentId,
      requireIdempotencyKey(key),
      contentUpdateSchema.parse(body)
    );
  }

  @Post("content/:contentId/submit")
  public submitContent(
    @Req() request: AuthenticatedRequest,
    @Param("contentId") contentId: string,
    @Headers("idempotency-key") key: string | undefined
  ): Promise<unknown> {
    return this.operations.submitContent(
      this.context(request),
      contentId,
      requireIdempotencyKey(key)
    );
  }

  @Get("publications")
  public listPublications(@Req() request: AuthenticatedRequest): Promise<unknown> {
    return this.operations.listPublications(this.context(request));
  }

  @Post("publications")
  public createPublication(
    @Req() request: AuthenticatedRequest,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown
  ): Promise<unknown> {
    return this.operations.createPublication(
      this.context(request),
      requireIdempotencyKey(key),
      publicationCreateSchema.parse(body)
    );
  }

  @Patch("publications/:publicationId")
  public updatePublication(
    @Req() request: AuthenticatedRequest,
    @Param("publicationId") publicationId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown
  ): Promise<unknown> {
    return this.operations.updatePublication(
      this.context(request),
      publicationId,
      requireIdempotencyKey(key),
      publicationUpdateSchema.parse(body)
    );
  }

  @Get("reports")
  public listReports(@Req() request: AuthenticatedRequest): Promise<unknown> {
    return this.operations.listReports(this.context(request));
  }

  @Post("reports")
  public createReport(
    @Req() request: AuthenticatedRequest,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown
  ): Promise<unknown> {
    return this.operations.createReport(
      this.context(request),
      requireIdempotencyKey(key),
      reportCreateSchema.parse(body)
    );
  }

  @Get("reports/:reportId/artifact")
  public getReportArtifact(
    @Req() request: AuthenticatedRequest,
    @Param("reportId") reportId: string
  ): Promise<unknown> {
    return this.operations.getReportArtifact(this.context(request), reportId);
  }

  @Post("reports/:reportId/submit")
  public submitReport(
    @Req() request: AuthenticatedRequest,
    @Param("reportId") reportId: string,
    @Headers("idempotency-key") key: string | undefined
  ): Promise<unknown> {
    return this.operations.submitReport(
      this.context(request),
      reportId,
      requireIdempotencyKey(key)
    );
  }

  @Post("reports/:reportId/deliveries")
  public createReportDelivery(
    @Req() request: AuthenticatedRequest,
    @Param("reportId") reportId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown
  ): Promise<unknown> {
    return this.operations.createReportDelivery(
      this.context(request),
      reportId,
      requireIdempotencyKey(key),
      reportDeliveryRequestSchema.parse(body)
    );
  }

  private context(request: AuthenticatedRequest): TenantContext {
    if (request.tenantContext === undefined) {
      throw new DomainError("GM-AUTHZ-CONTEXT", "Contexto não autenticado.", false);
    }
    return request.tenantContext;
  }
}
