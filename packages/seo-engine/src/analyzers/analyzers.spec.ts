import { describe, expect, it } from "vitest";
import { parseHtmlDocument } from "./html.js";
import { parseSitemapXml } from "./sitemap.js";
import { analyzeContentPage } from "../rules/content.js";
import { analyzeStructuredData } from "../rules/schema.js";
import { analyzeTechnicalPage } from "../rules/technical.js";

const context = {
  targetId: "01954d2e-3b80-7000-8000-000000000001",
  evidenceId: "01954d2e-3b80-7000-8000-000000000002",
  capturedAt: "2026-07-27T12:00:00.000Z",
  source: "crawler",
  coverage: 1,
  freshness: 1,
  agreement: 1
};

describe("HTML analyzer", () => {
  it("extracts normalized facts without executing the page", () => {
    const document = parseHtmlDocument({
      url: "HTTPS://Example.com:443/path#fragment",
      html: "<html lang='pt-BR'><head><title> Exemplo </title><link rel='canonical' href='/path'><script type='application/ld+json'>{\"@type\":\"WebPage\"}</script></head><body><h1>Olá</h1><a href='/contato'>Contato</a></body></html>"
    });
    expect(document.url).toBe("https://example.com/path");
    expect(document.canonicalUrl).toBe("https://example.com/path");
    expect(document.headings.h1).toEqual(["Olá"]);
    expect(document.links).toContain("https://example.com/contato");
  });

  it("never treats missing metadata as a fabricated value", () => {
    const document = parseHtmlDocument({ url: "https://example.com", html: "<body></body>" });
    expect(document.title).toBeNull();
    expect(document.description).toBeNull();
    const findings = [
      ...analyzeTechnicalPage({ document, statusCode: 200, critical: true, context }),
      ...analyzeContentPage({ document, context })
    ];
    expect(findings.map((finding) => finding.code)).toContain("SEO-CONTENT-EMPTY");
  });

  it("reports malformed JSON-LD with deterministic evidence", () => {
    const document = parseHtmlDocument({
      url: "https://example.com",
      html: "<script type='application/ld+json'>{invalid}</script><body>Conteúdo</body>"
    });
    expect(analyzeStructuredData({ document, context })[0]?.code).toBe("SEO-SCHEMA-INVALID-JSON");
  });
});

describe("sitemap parser", () => {
  it("deduplicates URLs and records invalid protocols", () => {
    const sitemap = parseSitemapXml(
      "<urlset><url><loc>https://example.com/a</loc></url><url><loc>https://example.com/a</loc></url><url><loc>file:///etc/passwd</loc></url></urlset>"
    );
    expect(sitemap.urls).toEqual(["https://example.com/a"]);
    expect(sitemap.invalidLocations).toEqual(["file:///etc/passwd"]);
  });
});
