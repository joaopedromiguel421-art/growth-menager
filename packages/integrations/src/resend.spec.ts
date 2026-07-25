import { createHmac, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyResendWebhook } from "./resend.js";

describe("verifyResendWebhook", () => {
  it("accepts a valid Svix signature and rejects a modified body", () => {
    const key = randomBytes(32);
    const timestamp = "1700000000";
    const id = "msg_test";
    const payload = '{"type":"email.delivered"}';
    const signature = createHmac("sha256", key)
      .update(`${id}.${timestamp}.${payload}`)
      .digest("base64");
    const input = {
      id,
      timestamp,
      signature: `v1,${signature}`,
      payload,
      secret: `whsec_${key.toString("base64")}`,
      nowSeconds: Number(timestamp)
    };

    expect(verifyResendWebhook(input)).toBe(true);
    expect(verifyResendWebhook({ ...input, payload: `${payload} ` })).toBe(false);
  });

  it("rejects replayed signatures outside the tolerance window", () => {
    expect(
      verifyResendWebhook({
        id: "msg_test",
        timestamp: "1",
        signature: "v1,invalid",
        payload: "{}",
        secret: "whsec_dGVzdA==",
        nowSeconds: 1000,
        toleranceSeconds: 10
      })
    ).toBe(false);
  });
});
