import { Body, Controller, Get, Headers, Param, Patch, Post, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import {
  seoAnalysisRunRequestSchema,
  seoFindingStatusUpdateSchema,
  seoMonitoringProfileInputSchema,
  seoTargetCreateSchema,
  seoTargetUpdateSchema
} from "@growth-manager/contracts";
import { DomainError, type TenantContext } from "@growth-manager/domain";
import { requireIdempotencyKey } from "./idempotency.js";
import type { AuthenticatedRequest } from "./request-context.js";
import { SeoService } from "./seo.service.js";

@ApiTags("seo")
@ApiBearerAuth()
@Controller("v1/tenants/:tenantId/seo")
export class SeoController {
  public constructor(private readonly seo: SeoService) {}

  @Get("targets")
  public listTargets(@Req() request: AuthenticatedRequest): Promise<unknown> {
    return this.seo.listTargets(this.context(request));
  }

  @Post("targets")
  public createTarget(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown
  ): Promise<unknown> {
    return this.seo.createTarget(this.context(request), seoTargetCreateSchema.parse(body));
  }

  @Patch("targets/:targetId")
  public updateTarget(
    @Req() request: AuthenticatedRequest,
    @Param("targetId") targetId: string,
    @Body() body: unknown
  ): Promise<unknown> {
    return this.seo.updateTarget(
      this.context(request),
      targetId,
      seoTargetUpdateSchema.parse(body)
    );
  }

  @Get("targets/:targetId/monitoring-profile")
  public getMonitoringProfile(
    @Req() request: AuthenticatedRequest,
    @Param("targetId") targetId: string
  ): Promise<unknown> {
    return this.seo.getMonitoringProfile(this.context(request), targetId);
  }

  @Patch("targets/:targetId/monitoring-profile")
  public updateMonitoringProfile(
    @Req() request: AuthenticatedRequest,
    @Param("targetId") targetId: string,
    @Body() body: unknown
  ): Promise<unknown> {
    return this.seo.updateMonitoringProfile(
      this.context(request),
      targetId,
      seoMonitoringProfileInputSchema.parse(body)
    );
  }

  @Post("analysis-runs")
  public startAnalysis(
    @Req() request: AuthenticatedRequest,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown
  ): Promise<unknown> {
    return this.seo.startAnalysis(
      this.context(request),
      requireIdempotencyKey(idempotencyKey),
      seoAnalysisRunRequestSchema.parse(body)
    );
  }

  @Get("analysis-runs/:runId")
  public getAnalysisRun(
    @Req() request: AuthenticatedRequest,
    @Param("runId") runId: string
  ): Promise<unknown> {
    return this.seo.getAnalysisRun(this.context(request), runId);
  }

  @Get("targets/:targetId/history")
  public listHistory(
    @Req() request: AuthenticatedRequest,
    @Param("targetId") targetId: string
  ): Promise<unknown> {
    return this.seo.listHistory(this.context(request), targetId);
  }

  @Get("targets/:targetId/baseline")
  public getBaseline(
    @Req() request: AuthenticatedRequest,
    @Param("targetId") targetId: string
  ): Promise<unknown> {
    return this.seo.getBaseline(this.context(request), targetId);
  }

  @Get("findings")
  public listFindings(@Req() request: AuthenticatedRequest): Promise<unknown> {
    return this.seo.listFindings(this.context(request));
  }

  @Get("findings/:findingId/evidence")
  public listFindingEvidence(
    @Req() request: AuthenticatedRequest,
    @Param("findingId") findingId: string
  ): Promise<unknown> {
    return this.seo.listFindingEvidence(this.context(request), findingId);
  }

  @Patch("findings/:findingId/status")
  public updateFindingStatus(
    @Req() request: AuthenticatedRequest,
    @Param("findingId") findingId: string,
    @Body() body: unknown
  ): Promise<unknown> {
    return this.seo.updateFindingStatus(
      this.context(request),
      findingId,
      seoFindingStatusUpdateSchema.parse(body)
    );
  }

  private context(request: AuthenticatedRequest): TenantContext {
    if (request.tenantContext === undefined) {
      throw new DomainError("GM-AUTHZ-CONTEXT", "Contexto não autenticado.", false);
    }
    return request.tenantContext;
  }
}
