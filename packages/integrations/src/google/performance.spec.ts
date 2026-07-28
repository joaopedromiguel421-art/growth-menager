import { describe, expect, it } from "vitest";
import { ChromeUxReportClient, PageSpeedInsightsClient } from "./performance.js";

describe("Google performance adapters", () => {
  it("keeps PageSpeed laboratory metrics distinct from field data", async () => {
    const client = new PageSpeedInsightsClient({
      apiKey: "key",
      fetchImpl: (): Promise<Response> =>
        Promise.resolve(
          Response.json({
            id: "https://example.com/",
            lighthouseResult: {
              fetchTime: "2026-07-27T12:00:00Z",
              categories: { performance: { score: 0.91 } },
              audits: {
                "largest-contentful-paint": { numericValue: 2200 },
                "cumulative-layout-shift": { numericValue: 0.11 },
                "total-blocking-time": { numericValue: 180 }
              }
            }
          })
        )
    });

    const result = await client.read({ url: "https://example.com/", strategy: "mobile" });
    expect(result.data).toMatchObject({
      source: "pagespeed",
      strategy: "mobile",
      performanceScore: 0.91,
      lcpMs: 2200,
      cls: 0.11,
      totalBlockingTimeMs: 180
    });
  });

  it("returns unknown metrics as null when CrUX has no sample", async () => {
    const client = new ChromeUxReportClient({
      apiKey: "key",
      fetchImpl: (): Promise<Response> =>
        Promise.resolve(
          Response.json({
            record: {
              key: { url: "https://example.com/", formFactor: "PHONE" },
              collectionPeriod: {
                firstDate: { year: 2026, month: 6, day: 30 },
                lastDate: { year: 2026, month: 7, day: 27 }
              },
              metrics: {
                largest_contentful_paint: { percentiles: { p75: 2400 } },
                cumulative_layout_shift: { percentiles: { p75: 0.08 } }
              }
            }
          })
        )
    });

    const result = await client.read({ url: "https://example.com/", formFactor: "PHONE" });
    expect(result.data).toMatchObject({ lcpMs: 2400, cls: 0.08, inpMs: null });
  });
});
