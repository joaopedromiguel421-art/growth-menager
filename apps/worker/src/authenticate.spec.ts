import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyWorkerSignature } from "./authenticate.js";

describe("verifyWorkerSignature", () => {
  it("accepts a current valid signature and rejects replay", () => {
    const now = Date.now();
    const body = "{}";
    const timestamp = String(now);
    const secret = "x".repeat(32);
    const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");

    expect(verifyWorkerSignature({ body, timestamp, signature, secret, now })).toBe(true);
    expect(
      verifyWorkerSignature({ body, timestamp, signature, secret, now: now + 6 * 60 * 1000 })
    ).toBe(false);
  });
});
