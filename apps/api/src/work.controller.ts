import { Body, Controller, Get, Headers, Param, Patch, Post, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import {
  approvalDecisionSchema,
  recommendationDecisionSchema,
  taskCreateSchema,
  taskUpdateSchema
} from "@growth-manager/contracts";
import { DomainError, type TenantContext } from "@growth-manager/domain";
import { requireIdempotencyKey } from "./idempotency.js";
import type { AuthenticatedRequest } from "./request-context.js";
import { WorkService } from "./work.service.js";

@ApiTags("work")
@ApiBearerAuth()
@Controller("v1/tenants/:tenantId")
export class WorkController {
  public constructor(private readonly work: WorkService) {}

  @Get("recommendations")
  public listRecommendations(@Req() request: AuthenticatedRequest): Promise<unknown> {
    return this.work.listRecommendations(this.context(request));
  }

  @Post("recommendations/:recommendationId/decision")
  public decideRecommendation(
    @Req() request: AuthenticatedRequest,
    @Param("recommendationId") recommendationId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown
  ): Promise<unknown> {
    return this.work.decideRecommendation(
      this.context(request),
      recommendationId,
      requireIdempotencyKey(idempotencyKey),
      recommendationDecisionSchema.parse(body)
    );
  }

  @Get("tasks")
  public listTasks(@Req() request: AuthenticatedRequest): Promise<unknown> {
    return this.work.listTasks(this.context(request));
  }

  @Post("tasks")
  public createTask(
    @Req() request: AuthenticatedRequest,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown
  ): Promise<unknown> {
    return this.work.createTask(
      this.context(request),
      requireIdempotencyKey(idempotencyKey),
      taskCreateSchema.parse(body)
    );
  }

  @Patch("tasks/:taskId")
  public updateTask(
    @Req() request: AuthenticatedRequest,
    @Param("taskId") taskId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown
  ): Promise<unknown> {
    return this.work.updateTask(
      this.context(request),
      taskId,
      requireIdempotencyKey(idempotencyKey),
      taskUpdateSchema.parse(body)
    );
  }

  @Get("approvals")
  public listApprovals(@Req() request: AuthenticatedRequest): Promise<unknown> {
    return this.work.listApprovals(this.context(request));
  }

  @Post("approvals/:approvalId/decision")
  public decideApproval(
    @Req() request: AuthenticatedRequest,
    @Param("approvalId") approvalId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown
  ): Promise<unknown> {
    if (request.authAal !== "aal2") {
      throw new DomainError("GM-AUTH-MFA-REQUIRED", "Confirme o MFA para decidir.", false);
    }
    return this.work.decideApproval(
      this.context(request),
      approvalId,
      requireIdempotencyKey(idempotencyKey),
      approvalDecisionSchema.parse(body)
    );
  }

  private context(request: AuthenticatedRequest): TenantContext {
    if (request.tenantContext === undefined) {
      throw new DomainError("GM-AUTHZ-CONTEXT", "Contexto não autenticado.", false);
    }
    return request.tenantContext;
  }

}
