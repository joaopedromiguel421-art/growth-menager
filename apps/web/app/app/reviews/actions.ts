"use server";

import { revalidatePath } from "next/cache";
import {
  createReviewReplyDraft,
  submitReviewReplyForApproval,
  updateReviewReplyDraft
} from "../../../lib/api";
import { loadWorkspace } from "../../../lib/session";

async function activeTenantId(): Promise<string | null> {
  const result = await loadWorkspace();
  if (!result.ok) return null;
  return result.workspace.activeTenant?.id ?? null;
}

export async function createDraftAction(formData: FormData): Promise<void> {
  const tenantId = await activeTenantId();
  const reviewId = formData.get("review_id");
  if (tenantId === null || typeof reviewId !== "string") return;

  await createReviewReplyDraft(tenantId, reviewId, crypto.randomUUID());
  revalidatePath(`/app/reviews/${reviewId}`);
}

export interface UpdateDraftState {
  readonly error: string | null;
}

export async function updateDraftAction(
  _previous: UpdateDraftState,
  formData: FormData
): Promise<UpdateDraftState> {
  const tenantId = await activeTenantId();
  const reviewId = formData.get("review_id");
  const replyId = formData.get("reply_id");
  const bodyValue = formData.get("body");
  const body = typeof bodyValue === "string" ? bodyValue.trim() : "";
  if (tenantId === null || typeof reviewId !== "string" || typeof replyId !== "string") {
    return { error: "Não foi possível identificar o rascunho." };
  }
  if (body.length === 0) {
    return { error: "O texto da resposta não pode ficar vazio." };
  }

  const result = await updateReviewReplyDraft(
    tenantId,
    reviewId,
    replyId,
    crypto.randomUUID(),
    body
  );
  if (!result.ok) return { error: result.message };

  revalidatePath(`/app/reviews/${reviewId}`);
  return { error: null };
}

export async function submitForApprovalAction(formData: FormData): Promise<void> {
  const tenantId = await activeTenantId();
  const reviewId = formData.get("review_id");
  const replyId = formData.get("reply_id");
  if (tenantId === null || typeof reviewId !== "string" || typeof replyId !== "string") return;

  await submitReviewReplyForApproval(tenantId, reviewId, replyId, crypto.randomUUID());
  revalidatePath(`/app/reviews/${reviewId}`);
  revalidatePath("/app/approvals");
}
