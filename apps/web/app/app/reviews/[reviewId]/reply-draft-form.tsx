"use client";

import { useActionState } from "react";
import { SubmitButton } from "../../../../components/submit-button";
import { updateDraftAction, type UpdateDraftState } from "../actions";

const initialState: UpdateDraftState = { error: null };

export function ReplyDraftForm({
  reviewId,
  replyId,
  initialBody
}: {
  readonly reviewId: string;
  readonly replyId: string;
  readonly initialBody: string;
}): React.ReactNode {
  const [state, action] = useActionState(updateDraftAction, initialState);

  return (
    <form action={action}>
      <input name="review_id" type="hidden" value={reviewId} />
      <input name="reply_id" type="hidden" value={replyId} />
      <label className="sr-only" htmlFor="body">
        Texto da resposta
      </label>
      <textarea defaultValue={initialBody} id="body" maxLength={4096} name="body" />
      {state.error === null ? null : (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      )}
      <SubmitButton pendingLabel="Salvando…">Salvar edição</SubmitButton>
    </form>
  );
}
