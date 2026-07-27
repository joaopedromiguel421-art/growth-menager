import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";
import type { Review, ReviewDetail, ReviewReply, ReviewReplyUpdate } from "@growth-manager/contracts";
import { schema, type Database, type DatabaseClient } from "@growth-manager/database";
import {
  DomainError,
  buildReplyTemplate,
  newId,
  requirePermission,
  type TenantContext
} from "@growth-manager/domain";
import { DATABASE } from "./database.provider.js";

@Injectable()
export class ReviewsService {
  public constructor(@Inject(DATABASE) private readonly client: DatabaseClient) {}

  public listReviews(context: TenantContext): Promise<readonly Review[]> {
    requirePermission(context, "reviews.read");
    return this.client.withTenant(context, async (database) => {
      const records = await database
        .select()
        .from(schema.reviews)
        .where(eq(schema.reviews.tenantId, context.tenantId))
        .orderBy(desc(schema.reviews.publishedAt))
        .limit(100);
      return records.map(toReview);
    });
  }

  public getReview(context: TenantContext, reviewId: string): Promise<ReviewDetail> {
    requirePermission(context, "reviews.read");
    return this.client.withTenant(context, async (database) => {
      const review = await this.loadReview(database, context, reviewId);
      const replies = await database
        .select()
        .from(schema.reviewReplies)
        .where(
          and(
            eq(schema.reviewReplies.reviewId, reviewId),
            eq(schema.reviewReplies.tenantId, context.tenantId)
          )
        )
        .orderBy(desc(schema.reviewReplies.version));
      return { review: toReview(review), replies: replies.map(toReviewReply) };
    });
  }

  public createReplyDraft(
    context: TenantContext,
    reviewId: string,
    idempotencyKey: string
  ): Promise<ReviewReply> {
    requirePermission(context, "reviews.reply");
    return this.client.withTenant(context, async (database) => {
      const review = await this.loadReview(database, context, reviewId);
      if (review.sensitiveTheme) {
        throw new DomainError(
          "GM-REVIEW-SENSITIVE-BLOCKED",
          "Este tema exige atendimento humano direto; nenhum rascunho automático é permitido.",
          false
        );
      }

      const nextVersion = await this.nextReplyVersion(database, context, reviewId);
      const body = buildReplyTemplate({ rating: review.rating, authorName: review.authorName });
      const reply = await this.insertReply(database, context, {
        reviewId,
        body,
        version: nextVersion
      });

      await this.setReviewReplyStatus(database, context, reviewId, "draft");
      await this.outbox(database, context, idempotencyKey, "review_reply_drafted", {
        review_id: reviewId,
        reply_id: reply.id
      });
      return toReviewReply(reply);
    });
  }

  public updateReplyDraft(
    context: TenantContext,
    reviewId: string,
    replyId: string,
    idempotencyKey: string,
    input: ReviewReplyUpdate
  ): Promise<ReviewReply> {
    requirePermission(context, "reviews.reply");
    return this.client.withTenant(context, async (database) => {
      const current = await this.loadReply(database, context, reviewId, replyId);
      if (current.status !== "draft") {
        throw new DomainError(
          "GM-REVIEW-REPLY-CONFLICT",
          "Esta resposta não está mais em rascunho.",
          false
        );
      }

      const reply = await this.insertReply(database, context, {
        reviewId,
        body: input.body,
        version: current.version + 1
      });
      await this.outbox(database, context, idempotencyKey, "review_reply_edited", {
        review_id: reviewId,
        reply_id: reply.id
      });
      return toReviewReply(reply);
    });
  }

  public submitForApproval(
    context: TenantContext,
    reviewId: string,
    replyId: string,
    idempotencyKey: string
  ): Promise<Readonly<Record<string, string>>> {
    requirePermission(context, "reviews.reply");
    return this.client.withTenant(context, async (database) => {
      const review = await this.loadReview(database, context, reviewId);
      const records = await database
        .update(schema.reviewReplies)
        .set({ status: "awaiting_approval", updatedAt: new Date() })
        .where(
          and(
            eq(schema.reviewReplies.id, replyId),
            eq(schema.reviewReplies.reviewId, reviewId),
            eq(schema.reviewReplies.tenantId, context.tenantId),
            eq(schema.reviewReplies.status, "draft")
          )
        )
        .returning();
      const reply = records[0];
      if (reply === undefined) {
        throw new DomainError(
          "GM-REVIEW-REPLY-CONFLICT",
          "Esta resposta não está mais em rascunho.",
          false
        );
      }
      await this.setReviewReplyStatus(database, context, reviewId, "awaiting_approval");

      const risk = review.rating <= 2 ? "high" : review.rating === 3 ? "medium" : "low";
      const contentSha256 = createHash("sha256").update(reply.body).digest("hex");
      const approvals = await database
        .insert(schema.approvals)
        .values({
          id: newId(),
          tenantId: context.tenantId,
          subjectType: "review_reply",
          subjectId: reviewId,
          subjectVersion: reply.version,
          risk,
          status: "pending",
          requestedBy: context.userId,
          contentSha256
        })
        .returning();
      const approval = approvals[0];
      if (approval === undefined) {
        throw new DomainError("GM-APPROVAL-CREATE", "Não foi possível solicitar aprovação.", true);
      }

      await this.outbox(database, context, idempotencyKey, "review_reply_submitted", {
        review_id: reviewId,
        reply_id: reply.id,
        approval_id: approval.id
      });
      return { review_id: reviewId, reply_id: reply.id, approval_id: approval.id };
    });
  }

  private async nextReplyVersion(
    database: Database,
    context: TenantContext,
    reviewId: string
  ): Promise<number> {
    const latest = await database
      .select({ version: schema.reviewReplies.version })
      .from(schema.reviewReplies)
      .where(
        and(
          eq(schema.reviewReplies.reviewId, reviewId),
          eq(schema.reviewReplies.tenantId, context.tenantId)
        )
      )
      .orderBy(desc(schema.reviewReplies.version))
      .limit(1);
    return (latest[0]?.version ?? 0) + 1;
  }

  private async insertReply(
    database: Database,
    context: TenantContext,
    input: { readonly reviewId: string; readonly body: string; readonly version: number }
  ): Promise<typeof schema.reviewReplies.$inferSelect> {
    const rows = await database
      .insert(schema.reviewReplies)
      .values({
        id: newId(),
        tenantId: context.tenantId,
        reviewId: input.reviewId,
        body: input.body,
        status: "draft",
        version: input.version,
        createdBy: context.userId
      })
      .returning();
    const reply = rows[0];
    if (reply === undefined) {
      throw new DomainError("GM-REVIEW-REPLY-CREATE", "Não foi possível salvar o rascunho.", true);
    }
    return reply;
  }

  private async setReviewReplyStatus(
    database: Database,
    context: TenantContext,
    reviewId: string,
    replyStatus: string
  ): Promise<void> {
    await database
      .update(schema.reviews)
      .set({ replyStatus, updatedAt: new Date() })
      .where(and(eq(schema.reviews.id, reviewId), eq(schema.reviews.tenantId, context.tenantId)));
  }

  private async loadReview(
    database: Database,
    context: TenantContext,
    reviewId: string
  ): Promise<typeof schema.reviews.$inferSelect> {
    const rows = await database
      .select()
      .from(schema.reviews)
      .where(and(eq(schema.reviews.id, reviewId), eq(schema.reviews.tenantId, context.tenantId)))
      .limit(1);
    const review = rows[0];
    if (review === undefined) {
      throw new DomainError("GM-REVIEW-NOT-FOUND", "Avaliação não encontrada.", false);
    }
    return review;
  }

  private async loadReply(
    database: Database,
    context: TenantContext,
    reviewId: string,
    replyId: string
  ): Promise<typeof schema.reviewReplies.$inferSelect> {
    const rows = await database
      .select()
      .from(schema.reviewReplies)
      .where(
        and(
          eq(schema.reviewReplies.id, replyId),
          eq(schema.reviewReplies.reviewId, reviewId),
          eq(schema.reviewReplies.tenantId, context.tenantId)
        )
      )
      .limit(1);
    const reply = rows[0];
    if (reply === undefined) {
      throw new DomainError("GM-REVIEW-REPLY-NOT-FOUND", "Rascunho não encontrado.", false);
    }
    return reply;
  }

  private async outbox(
    database: Database,
    context: TenantContext,
    idempotencyKey: string,
    eventType: string,
    payload: Readonly<Record<string, unknown>>
  ): Promise<void> {
    await database.insert(schema.outboxEvents).values({
      id: newId(),
      tenantId: context.tenantId,
      aggregateType: eventType.split("_")[0] ?? "domain",
      aggregateId: newId(),
      eventType,
      schemaVersion: "1",
      idempotencyKey,
      payload,
      traceId: context.traceId
    });
  }
}

function toReview(item: typeof schema.reviews.$inferSelect): Review {
  return {
    id: item.id,
    tenant_id: item.tenantId,
    provider: item.provider,
    external_id: item.externalId,
    author_name: item.authorName,
    rating: item.rating,
    body: item.body,
    published_at: item.publishedAt.toISOString(),
    sentiment: item.sentiment as Review["sentiment"],
    sensitive_theme: item.sensitiveTheme,
    reply_status: item.replyStatus as Review["reply_status"]
  };
}

function toReviewReply(item: typeof schema.reviewReplies.$inferSelect): ReviewReply {
  return {
    id: item.id,
    tenant_id: item.tenantId,
    review_id: item.reviewId,
    body: item.body,
    status: item.status as ReviewReply["status"],
    version: item.version,
    published_at: item.publishedAt?.toISOString() ?? null,
    failure_code: item.failureCode
  };
}
