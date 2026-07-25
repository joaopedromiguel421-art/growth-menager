import { describe, expect, it } from "vitest";
import { approvalDecisionSchema, recommendationDecisionSchema } from "./work.js";
import { jobEnvelopeSchema } from "./jobs.js";

describe("jobEnvelopeSchema", () => {
  it("rejects a job without tenant context", () => {
    const result = jobEnvelopeSchema.safeParse({
      id: crypto.randomUUID(),
      schema_version: "1",
      job_type: "sync",
      idempotency_key: "sync:example",
      trace_id: "trace-12345678",
      attempt: 0,
      enqueued_at: new Date().toISOString(),
      cursor: null,
      payload: {}
    });

    expect(result.success).toBe(false);
  });
});

describe("work mutation contracts", () => {
  it("rejects approval decisions without a subject version", () => {
    expect(approvalDecisionSchema.safeParse({ decision: "approved", note: null }).success).toBe(
      false
    );
  });

  it("rejects an empty dismissal reason", () => {
    expect(
      recommendationDecisionSchema.safeParse({
        decision: "dismissed",
        reason: "",
        create_task: false
      }).success
    ).toBe(false);
  });
});
