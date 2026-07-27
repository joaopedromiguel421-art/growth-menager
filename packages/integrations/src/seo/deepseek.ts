import { createHmac } from "node:crypto";
import { z } from "zod";

const deepSeekResponseSchema = z
  .object({
    id: z.string().min(1),
    model: z.string().min(1),
    choices: z
      .array(
        z
          .object({
            finish_reason: z.string().nullable(),
            message: z.object({ content: z.string().nullable() }).loose()
          })
          .loose()
      )
      .min(1),
    usage: z
      .object({
        prompt_tokens: z.number().int().nonnegative().default(0),
        completion_tokens: z.number().int().nonnegative().default(0),
        prompt_cache_hit_tokens: z.number().int().nonnegative().optional(),
        prompt_cache_miss_tokens: z.number().int().nonnegative().optional()
      })
      .loose()
  })
  .loose();

export interface DeepSeekRequest {
  readonly model: string;
  readonly messages: readonly {
    readonly role: "system" | "user";
    readonly content: string;
  }[];
  readonly maxOutputTokens: number;
  readonly timeoutMs: number;
  readonly pseudonymousUserId: string;
}

export interface DeepSeekResult {
  readonly providerRequestId: string;
  readonly model: string;
  readonly output: unknown;
  readonly finishReason: string | null;
  readonly usage: {
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly cacheHitTokens: number;
    readonly cacheMissTokens: number;
  };
}

export class DeepSeekGatewayError extends Error {
  public constructor(
    public readonly code: "unavailable" | "invalid_response" | "empty_output" | "invalid_json",
    public readonly retryable: boolean
  ) {
    super(`DeepSeek request failed: ${code}`);
    this.name = "DeepSeekGatewayError";
  }
}

export class DeepSeekHttpGateway {
  public constructor(
    private readonly options: {
      readonly apiKey: string;
      readonly baseUrl: string;
      readonly fetchImpl?: typeof fetch;
    }
  ) {}

  public async complete(input: DeepSeekRequest): Promise<DeepSeekResult> {
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const response = await requestCompletion(fetchImpl, this.options, input);
    if (!response.ok) {
      throw new DeepSeekGatewayError(
        "unavailable",
        response.status === 429 || response.status >= 500
      );
    }

    const payload = await readJson(response);
    return parseDeepSeekResult(payload);
  }
}

function parseDeepSeekResult(payload: unknown): DeepSeekResult {
  const parsed = deepSeekResponseSchema.safeParse(payload);
  if (!parsed.success) throw new DeepSeekGatewayError("invalid_response", false);
  const choice = parsed.data.choices[0];
  const content = choice?.message.content?.trim() ?? "";
  if (content.length === 0) throw new DeepSeekGatewayError("empty_output", true);

  const output = parseJsonOutput(content);
  return {
    providerRequestId: parsed.data.id,
    model: parsed.data.model,
    output,
    finishReason: choice?.finish_reason ?? null,
    usage: {
      inputTokens: parsed.data.usage.prompt_tokens,
      outputTokens: parsed.data.usage.completion_tokens,
      cacheHitTokens: parsed.data.usage.prompt_cache_hit_tokens ?? 0,
      cacheMissTokens: parsed.data.usage.prompt_cache_miss_tokens ?? parsed.data.usage.prompt_tokens
    }
  };
}

async function requestCompletion(
  fetchImpl: typeof fetch,
  options: { readonly apiKey: string; readonly baseUrl: string },
  input: DeepSeekRequest
): Promise<Response> {
  try {
    return await fetchImpl(`${options.baseUrl.replace(/\/$/u, "")}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        model: input.model,
        messages: input.messages,
        max_tokens: input.maxOutputTokens,
        temperature: 0,
        stream: false,
        response_format: { type: "json_object" },
        user: input.pseudonymousUserId
      }),
      signal: AbortSignal.timeout(input.timeoutMs)
    });
  } catch {
    throw new DeepSeekGatewayError("unavailable", true);
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new DeepSeekGatewayError("invalid_response", false);
  }
}

function parseJsonOutput(content: string): unknown {
  try {
    return JSON.parse(content) as unknown;
  } catch {
    throw new DeepSeekGatewayError("invalid_json", false);
  }
}

export function pseudonymousDeepSeekUserId(tenantId: string, hmacKey: string): string {
  return createHmac("sha256", hmacKey).update(tenantId).digest("hex");
}
