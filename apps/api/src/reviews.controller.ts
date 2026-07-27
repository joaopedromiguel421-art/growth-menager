import { Body, Controller, Get, Headers, Param, Patch, Post, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { reviewReplyUpdateSchema } from "@growth-manager/contracts";
import { DomainError, type TenantContext } from "@growth-manager/domain";
import { requireIdempotencyKey } from "./idempotency.js";
import type { AuthenticatedRequest } from "./request-context.js";
import { ReviewsService } from "./reviews.service.js";

@ApiTags("reviews")
@ApiBearerAuth()
@Controller("v1/tenants/:tenantId")
export class ReviewsController {
  public constructor(private readonly reviews: ReviewsService) {}

  @Get("reviews")
  public listReviews(@Req() request: AuthenticatedRequest): Promise<unknown> {
    return this.reviews.listReviews(this.context(request));
  }

  @Get("reviews/:reviewId")
  public getReview(
    @Req() request: AuthenticatedRequest,
    @Param("reviewId") reviewId: string
  ): Promise<unknown> {
    return this.reviews.getReview(this.context(request), reviewId);
  }

  @Post("reviews/:reviewId/replies")
  public createReplyDraft(
    @Req() request: AuthenticatedRequest,
    @Param("reviewId") reviewId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined
  ): Promise<unknown> {
    return this.reviews.createReplyDraft(
      this.context(request),
      reviewId,
      requireIdempotencyKey(idempotencyKey)
    );
  }

  @Patch("reviews/:reviewId/replies/:replyId")
  public updateReplyDraft(
    @Req() request: AuthenticatedRequest,
    @Param("reviewId") reviewId: string,
    @Param("replyId") replyId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown
  ): Promise<unknown> {
    return this.reviews.updateReplyDraft(
      this.context(request),
      reviewId,
      replyId,
      requireIdempotencyKey(idempotencyKey),
      reviewReplyUpdateSchema.parse(body)
    );
  }

  @Post("reviews/:reviewId/replies/:replyId/submit")
  public submitForApproval(
    @Req() request: AuthenticatedRequest,
    @Param("reviewId") reviewId: string,
    @Param("replyId") replyId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined
  ): Promise<unknown> {
    return this.reviews.submitForApproval(
      this.context(request),
      reviewId,
      replyId,
      requireIdempotencyKey(idempotencyKey)
    );
  }

  private context(request: AuthenticatedRequest): TenantContext {
    if (request.tenantContext === undefined) {
      throw new DomainError("GM-AUTHZ-CONTEXT", "Contexto não autenticado.", false);
    }
    return request.tenantContext;
  }
}
