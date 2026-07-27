import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

export interface SafeFetchPolicy {
  readonly timeoutMs: number;
  readonly maxRedirects: number;
  readonly maxBytes: number;
  readonly allowedContentTypes: readonly string[];
  readonly userAgent: string;
}

export interface SafeFetchResult {
  readonly requestedUrl: string;
  readonly finalUrl: string;
  readonly status: number;
  readonly contentType: string | null;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: Uint8Array;
  readonly redirects: readonly string[];
}

export class UnsafeUrlError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

type AddressResolver = (hostname: string) => Promise<readonly string[]>;

const defaultPolicy: SafeFetchPolicy = {
  timeoutMs: 30_000,
  maxRedirects: 3,
  maxBytes: 5 * 1024 * 1024,
  allowedContentTypes: ["text/html", "application/xhtml+xml", "application/xml", "text/xml"],
  userAgent: "GrowthManagerSEO/1.0 (+https://growthmanager.com.br)"
};

export class SafeFetchClient {
  public constructor(
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly resolver: AddressResolver = resolveAddresses
  ) {}

  public async fetch(
    url: string,
    overrides: Partial<SafeFetchPolicy> = {}
  ): Promise<SafeFetchResult> {
    const policy = { ...defaultPolicy, ...overrides };
    validatePolicy(policy);
    const requestedUrl = normalizeExternalUrl(url);
    let currentUrl = requestedUrl;
    const redirects: string[] = [];

    for (let hop = 0; hop <= policy.maxRedirects; hop += 1) {
      const response = await this.request(currentUrl, policy);

      if (isRedirect(response.status)) {
        currentUrl = redirectTarget(response, currentUrl, hop, policy.maxRedirects);
        redirects.push(currentUrl);
        continue;
      }

      const contentType = validateResponse(response, policy);
      const body = await readBoundedBody(response, policy.maxBytes);
      return {
        requestedUrl,
        finalUrl: currentUrl,
        status: response.status,
        contentType,
        headers: safeResponseHeaders(response.headers),
        body,
        redirects
      };
    }
    throw new UnsafeUrlError("Redirect limit exceeded.");
  }

  private async request(currentUrl: string, policy: SafeFetchPolicy): Promise<Response> {
    await this.assertPublic(currentUrl);
    return this.fetchImpl(currentUrl, {
      method: "GET",
      redirect: "manual",
      headers: {
        Accept: policy.allowedContentTypes.join(", "),
        "User-Agent": policy.userAgent
      },
      signal: AbortSignal.timeout(policy.timeoutMs),
      credentials: "omit"
    });
  }

  private async assertPublic(urlValue: string): Promise<void> {
    const url = new URL(urlValue);
    const addresses = await this.resolver(url.hostname);
    if (addresses.length === 0) throw new UnsafeUrlError("Hostname did not resolve.");
    if (addresses.some((address) => !isPublicAddress(address))) {
      throw new UnsafeUrlError("Hostname resolves to a private or reserved address.");
    }
  }
}

export function normalizeExternalUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeUrlError("Only HTTP and HTTPS URLs are allowed.");
  }
  if (url.username.length > 0 || url.password.length > 0) {
    throw new UnsafeUrlError("Credentials are not allowed in URLs.");
  }
  if (url.hostname.toLowerCase() === "localhost" || url.hostname.endsWith(".localhost")) {
    throw new UnsafeUrlError("Localhost is not allowed.");
  }
  url.hash = "";
  return url.toString();
}

export function isPublicAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return isPublicIpv4(address);
  if (version === 6) return isPublicIpv6(address);
  return false;
}

function isPublicIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  const a = parts[0];
  const b = parts[1];
  if (a === undefined || b === undefined) return false;
  if (new Set([0, 10, 127]).has(a) || a >= 224) return false;
  const blockedRanges: readonly (readonly [number, number, number])[] = [
    [100, 64, 127],
    [169, 254, 254],
    [172, 16, 31],
    [192, 0, 0],
    [192, 168, 168],
    [198, 18, 19],
    [198, 51, 51],
    [203, 0, 0]
  ];
  return !blockedRanges.some(
    ([first, minimum, maximum]) => a === first && b >= minimum && b <= maximum
  );
}

function isPublicIpv6(address: string): boolean {
  const normalized = address.toLowerCase();
  if (normalized === "::" || normalized === "::1") return false;
  if (["fc", "fd", "fe8", "fe9", "fea", "feb"].some((prefix) => normalized.startsWith(prefix)))
    return false;
  if (normalized.startsWith("2001:db8:")) return false;
  if (normalized.startsWith("::ffff:")) {
    const embedded = normalized.slice("::ffff:".length);
    return isIP(embedded) === 4 && isPublicIpv4(embedded);
  }
  return true;
}

async function resolveAddresses(hostname: string): Promise<readonly string[]> {
  if (isIP(hostname) !== 0) return [hostname];
  const records = await dnsLookup(hostname, { all: true, verbatim: true });
  return records.map((record) => record.address);
}

function isRedirect(status: number): boolean {
  return [301, 302, 303, 307, 308].includes(status);
}

function validatePolicy(policy: SafeFetchPolicy): void {
  if (policy.maxRedirects < 0 || policy.maxRedirects > 5) {
    throw new RangeError("maxRedirects must be between 0 and 5");
  }
}

function redirectTarget(
  response: Response,
  currentUrl: string,
  hop: number,
  maxRedirects: number
): string {
  const location = response.headers.get("location");
  if (location === null) throw new UnsafeUrlError("Redirect response is missing Location.");
  if (hop === maxRedirects) throw new UnsafeUrlError("Redirect limit exceeded.");
  return normalizeExternalUrl(new URL(location, currentUrl).toString());
}

function validateResponse(response: Response, policy: SafeFetchPolicy): string | null {
  const contentType =
    response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ?? null;
  if (contentType !== null && !policy.allowedContentTypes.includes(contentType)) {
    throw new UnsafeUrlError(`Unsupported content type: ${contentType}`);
  }
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > policy.maxBytes) {
    throw new UnsafeUrlError("Response exceeds the configured byte limit.");
  }
  return contentType;
}

async function readBoundedBody(response: Response, maxBytes: number): Promise<Uint8Array> {
  if (response.body === null) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.byteLength;
      if (length > maxBytes)
        throw new UnsafeUrlError("Response exceeds the configured byte limit.");
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function safeResponseHeaders(headers: Headers): Readonly<Record<string, string>> {
  const safeNames = [
    "content-type",
    "content-length",
    "cache-control",
    "etag",
    "last-modified",
    "x-robots-tag"
  ];
  return Object.fromEntries(
    safeNames.flatMap((name) => {
      const value = headers.get(name);
      return value === null ? [] : [[name, value]];
    })
  );
}
