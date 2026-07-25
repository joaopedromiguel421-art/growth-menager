import { describe, expect, it } from "vitest";
import { FakeProviderAdapter } from "./index.js";

describe("FakeProviderAdapter", () => {
  it("is deterministic for an idempotency key", async () => {
    const adapter = new FakeProviderAdapter("ga4");
    const input = {
      tenantId: crypto.randomUUID(),
      requestId: "request-12345678",
      idempotencyKey: "fixture-key",
      operation: "sessions",
      cursor: null,
      payload: {}
    };
    const first = await adapter.read(input);
    const second = await adapter.read(input);

    expect(first).toEqual(second);
  });
});
