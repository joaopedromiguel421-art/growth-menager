import { describe, expect, it } from "vitest";
import { listAnalyticsProperties, runAnalyticsReport } from "./api.js";

describe("Google Analytics adapters", () => {
  it("lists GA4 properties across account-summary pages", async () => {
    const requested: string[] = [];
    const properties = await listAnalyticsProperties("token", (url) => {
      requested.push(requestUrl(url));
      return Promise.resolve(
        Response.json(
          requested.length === 1
            ? {
                accountSummaries: [
                  {
                    propertySummaries: [
                      { property: "properties/123", displayName: "Main property" }
                    ]
                  }
                ],
                nextPageToken: "next"
              }
            : {
                accountSummaries: [
                  {
                    propertySummaries: [
                      { property: "properties/456", displayName: "Store property" }
                    ]
                  }
                ]
              }
        )
      );
    });

    expect(properties).toEqual([
      { kind: "ga4_property", externalId: "properties/123", name: "Main property" },
      { kind: "ga4_property", externalId: "properties/456", name: "Store property" }
    ]);
    expect(requested[1]).toContain("pageToken=next");
  });

  it("normalizes allowlisted aggregate metrics and preserves returned quota", async () => {
    const report = await runAnalyticsReport(
      {
        accessToken: "token",
        propertyId: "properties/123",
        start: new Date("2026-07-01T00:00:00Z"),
        end: new Date("2026-07-02T00:00:00Z")
      },
      (_url, init) => {
        expect(JSON.parse(requestBody(init))).toMatchObject({ returnPropertyQuota: true });
        return Promise.resolve(
          Response.json({
            dimensionHeaders: [{ name: "date" }],
            metricHeaders: [{ name: "sessions" }, { name: "totalUsers" }],
            rows: [
              {
                dimensionValues: [{ value: "20260701" }],
                metricValues: [{ value: "12" }, { value: "7" }]
              }
            ],
            propertyQuota: { tokensPerDay: { consumed: 3, remaining: 199997 } }
          })
        );
      }
    );

    expect(report.metrics).toEqual([
      {
        metric: "GA4_SESSIONS",
        date: "2026-07-01",
        value: 12,
        dimensions: { property: "properties/123" }
      },
      {
        metric: "GA4_TOTAL_USERS",
        date: "2026-07-01",
        value: 7,
        dimensions: { property: "properties/123" }
      }
    ]);
    expect(report.quota).toEqual({ tokensPerDay: { consumed: 3, remaining: 199997 } });
  });
});

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  return input instanceof URL ? input.toString() : input.url;
}

function requestBody(init: RequestInit | undefined): string {
  if (typeof init?.body !== "string") throw new Error("Expected a JSON request body");
  return init.body;
}
