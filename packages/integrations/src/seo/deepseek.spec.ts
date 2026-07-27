import { describe, expect, it } from "vitest";
import { DeepSeekHttpGateway, pseudonymousDeepSeekUserId } from "./deepseek.js";

describe("DeepSeek gateway", () => {
  it("sends JSON mode without tools and parses usage", async () => {
    let requestBody: Readonly<Record<string, unknown>> | null = null;
    const gateway = new DeepSeekHttpGateway({
      apiKey: "test-key",
      baseUrl: "https://api.deepseek.test",
      fetchImpl: (_url, init): Promise<Response> => {
        if (typeof init?.body !== "string") throw new TypeError("Expected a JSON request body");
        requestBody = JSON.parse(init.body) as Readonly<Record<string, unknown>>;
        return Promise.resolve(
          Response.json({
            id: "request-1",
            model: "deepseek-v4-flash",
            choices: [{ finish_reason: "stop", message: { content: '{"schema_version":"1"}' } }],
            usage: {
              prompt_tokens: 10,
              completion_tokens: 2,
              prompt_cache_hit_tokens: 4,
              prompt_cache_miss_tokens: 6
            }
          })
        );
      }
    });
    const result = await gateway.complete({
      model: "deepseek-v4-flash",
      messages: [{ role: "system", content: "JSON" }],
      maxOutputTokens: 100,
      timeoutMs: 1000,
      pseudonymousUserId: "tenant-hmac"
    });
    expect(requestBody).not.toHaveProperty("tools");
    expect(requestBody).toMatchObject({ response_format: { type: "json_object" }, stream: false });
    expect(result.usage.cacheHitTokens).toBe(4);
  });

  it("creates a stable non-PII tenant identifier", () => {
    const first = pseudonymousDeepSeekUserId("tenant-a", "a sufficiently long internal key");
    expect(first).toBe(pseudonymousDeepSeekUserId("tenant-a", "a sufficiently long internal key"));
    expect(first).not.toContain("tenant-a");
  });
});
