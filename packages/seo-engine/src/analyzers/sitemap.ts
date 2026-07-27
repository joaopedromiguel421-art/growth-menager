import { load } from "cheerio";
import { normalizeHttpUrl } from "./html.js";

export interface ParsedSitemap {
  readonly kind: "urlset" | "index";
  readonly urls: readonly string[];
  readonly invalidLocations: readonly string[];
  readonly truncated: boolean;
}

export function parseSitemapXml(xml: string, limit = 50_000): ParsedSitemap {
  const $ = load(xml, { xml: true });
  const root = $.root().children().first().get(0)?.tagName.toLowerCase();
  if (root !== "urlset" && root !== "sitemapindex") {
    throw new TypeError("The document is not a sitemap urlset or sitemapindex.");
  }
  const rawLocations = $(root === "urlset" ? "url > loc" : "sitemap > loc")
    .toArray()
    .map((element) => $(element).text().trim())
    .filter((value) => value.length > 0);
  const urls: string[] = [];
  const invalidLocations: string[] = [];
  for (const value of rawLocations.slice(0, limit)) {
    try {
      urls.push(normalizeHttpUrl(value));
    } catch {
      invalidLocations.push(value);
    }
  }
  return {
    kind: root === "urlset" ? "urlset" : "index",
    urls: [...new Set(urls)],
    invalidLocations,
    truncated: rawLocations.length > limit
  };
}
