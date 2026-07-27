import { load } from "cheerio";

export interface ParsedStructuredData {
  readonly value: unknown;
  readonly error: string | null;
}

export interface ParsedHtmlDocument {
  readonly url: string;
  readonly title: string | null;
  readonly description: string | null;
  readonly canonicalUrl: string | null;
  readonly robots: readonly string[];
  readonly headings: Readonly<Record<"h1" | "h2" | "h3", readonly string[]>>;
  readonly structuredData: readonly ParsedStructuredData[];
  readonly links: readonly string[];
  readonly language: string | null;
  readonly text: string;
  readonly wordCount: number;
  readonly renderSuggested: boolean;
}

export function parseHtmlDocument(input: {
  readonly url: string;
  readonly html: string;
}): ParsedHtmlDocument {
  const normalizedUrl = normalizeHttpUrl(input.url);
  const $ = load(input.html);
  const title = nonEmpty($("title").first().text());
  const description = nonEmpty($("meta[name='description' i]").first().attr("content"));
  const canonicalUrl = resolveOptionalUrl(
    $("link[rel~='canonical' i]").first().attr("href"),
    normalizedUrl
  );
  const robots = ($("meta[name='robots' i]").first().attr("content") ?? "")
    .split(/[;,]/u)
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 0);
  const headings = {
    h1: headingTexts($, "h1"),
    h2: headingTexts($, "h2"),
    h3: headingTexts($, "h3")
  } as const;

  const structuredData: ParsedStructuredData[] = [];
  $("script[type='application/ld+json' i]").each((_index, element) => {
    const raw = $(element).text().trim();
    if (raw.length === 0) return;
    try {
      structuredData.push({ value: JSON.parse(raw) as unknown, error: null });
    } catch {
      structuredData.push({ value: null, error: "invalid_json" });
    }
  });

  const links = new Set<string>();
  $("a[href]").each((_index, element) => {
    const resolved = resolveOptionalUrl($(element).attr("href"), normalizedUrl);
    if (resolved !== null && links.size < 5000) links.add(resolved);
  });

  const body = $("body").clone();
  body.find("script,style,noscript,template,svg").remove();
  const text = body.text().replace(/\s+/gu, " ").trim();
  const wordCount = text.length === 0 ? 0 : text.split(/\s+/u).length;
  const scriptCount = $("script[src],script[type='module']").length;

  return {
    url: normalizedUrl,
    title,
    description,
    canonicalUrl,
    robots,
    headings,
    structuredData,
    links: [...links],
    language: nonEmpty($("html").attr("lang")),
    text,
    wordCount,
    renderSuggested: text.length < 50 && scriptCount >= 3
  };
}

export function normalizeHttpUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new TypeError("Only HTTP and HTTPS URLs are supported.");
  }
  if (url.username.length > 0 || url.password.length > 0) {
    throw new TypeError("Credentials are not allowed in URLs.");
  }
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();
  if (
    (url.protocol === "https:" && url.port === "443") ||
    (url.protocol === "http:" && url.port === "80")
  ) {
    url.port = "";
  }
  return url.toString();
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function headingTexts($: ReturnType<typeof load>, selector: string): readonly string[] {
  return $(selector)
    .toArray()
    .map((element) => $(element).text().replace(/\s+/gu, " ").trim())
    .filter((value) => value.length > 0);
}

function nonEmpty(value: string | undefined): string | null {
  const normalized = value?.replace(/\s+/gu, " ").trim() ?? "";
  return normalized.length === 0 ? null : normalized;
}

function resolveOptionalUrl(value: string | undefined, baseUrl: string): string | null {
  const normalized = nonEmpty(value);
  if (normalized === null) return null;
  try {
    return normalizeHttpUrl(new URL(normalized, baseUrl).toString());
  } catch {
    return null;
  }
}
