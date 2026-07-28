import { describe, expect, it } from "vitest";
import { renderReportHtml } from "./report-processor.js";

describe("renderReportHtml", () => {
  it("escapes tenant and metric labels in the canonical report", () => {
    const html = renderReportHtml(
      "Cliente <script>",
      {
        period: { start: "2026-06-01", end: "2026-06-30" },
        metrics: [{ metric: "CLICKS<script>", value: 42 }],
        tasks: { total: 2, completed: 1 },
        recommendations: { total: 1, accepted: 1 },
        alerts: { total: 0, critical: 0 }
      },
      { headline: "Resultado <mensal>", summary: "Tudo & certo" }
    );

    expect(html).toContain("Cliente &lt;script&gt;");
    expect(html).toContain("CLICKS&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain("Tudo &amp; certo");
  });
});
