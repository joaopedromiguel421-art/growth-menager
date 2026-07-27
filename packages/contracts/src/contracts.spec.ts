import { describe, expect, it } from "vitest";
import { approvalDecisionSchema, recommendationDecisionSchema } from "./work.js";
import { jobEnvelopeSchema } from "./jobs.js";
import { tenantCreateSchema, tenantUpdateSchema } from "./tenants.js";
import { invitationCreateSchema } from "./team.js";
import {
  seoFindingStatusUpdateSchema,
  seoMonitoringProfileInputSchema,
  seoTargetCreateSchema
} from "./seo.js";

describe("jobEnvelopeSchema", () => {
  it("rejects a job without tenant context", () => {
    const result = jobEnvelopeSchema.safeParse({
      id: crypto.randomUUID(),
      schema_version: "1",
      job_type: "sync",
      idempotency_key: "sync:example",
      trace_id: "trace-12345678",
      attempt: 0,
      enqueued_at: new Date().toISOString(),
      cursor: null,
      payload: {}
    });

    expect(result.success).toBe(false);
  });
});

describe("work mutation contracts", () => {
  it("rejects approval decisions without a subject version", () => {
    expect(approvalDecisionSchema.safeParse({ decision: "approved", note: null }).success).toBe(
      false
    );
  });

  it("rejects an empty dismissal reason", () => {
    expect(
      recommendationDecisionSchema.safeParse({
        decision: "dismissed",
        reason: "",
        create_task: false
      }).success
    ).toBe(false);
  });
});

describe("tenantCreateSchema", () => {
  const organizationId = "01954d2e-3b80-7000-8000-000000000001";

  it("accepts an existing organization with only a name", () => {
    const result = tenantCreateSchema.safeParse({
      name: "Padaria Aurora",
      organization_id: organizationId
    });

    expect(result.success).toBe(true);
    // The defaults are what a minimal form submission relies on.
    expect(result.data?.timezone).toBe("America/Sao_Paulo");
    expect(result.data?.country_code).toBe("BR");
    expect(result.data?.locale).toBe("pt-BR");
  });

  it("requires organization details when creating a new organization", () => {
    const result = tenantCreateSchema.safeParse({ name: "Padaria Aurora", organization_id: null });

    expect(result.success).toBe(false);
    const paths = result.error?.issues.map((issue) => issue.path.join("."));
    expect(paths).toContain("organization_name");
    expect(paths).toContain("billing_email");
  });

  it("rejects a slug the database check constraint would refuse", () => {
    for (const slug of ["Padaria", "padaria aurora", "padaria_aurora", "p"]) {
      expect(
        tenantCreateSchema.safeParse({ name: "Padaria", organization_id: organizationId, slug })
          .success
      ).toBe(false);
    }
  });

  it("rejects a timezone that Intl cannot resolve", () => {
    expect(
      tenantCreateSchema.safeParse({
        name: "Padaria",
        organization_id: organizationId,
        timezone: "Marte/Olympus"
      }).success
    ).toBe(false);
  });

  it("rejects unknown fields so a typo never silently does nothing", () => {
    expect(
      tenantCreateSchema.safeParse({
        name: "Padaria",
        organization_id: organizationId,
        tiemzone: "America/Sao_Paulo"
      }).success
    ).toBe(false);
  });
});

describe("tenantUpdateSchema", () => {
  it("requires the version so a blind write cannot overwrite a concurrent edit", () => {
    expect(tenantUpdateSchema.safeParse({ name: "Novo nome" }).success).toBe(false);
    expect(tenantUpdateSchema.safeParse({ version: 1, name: "Novo nome" }).success).toBe(true);
  });
});

describe("invitationCreateSchema", () => {
  it("defaults to the narrower tenant scope", () => {
    const result = invitationCreateSchema.safeParse({
      email: "pessoa@exemplo.com.br",
      role: "analyst"
    });

    expect(result.success).toBe(true);
    expect(result.data?.scope).toBe("tenant");
    expect(result.data?.expires_in_days).toBe(7);
  });

  it("refuses to hand out the platform-operator roles", () => {
    for (const role of ["platform_admin", "support"]) {
      expect(
        invitationCreateSchema.safeParse({ email: "pessoa@exemplo.com.br", role }).success
      ).toBe(false);
    }
  });
});

describe("SEO contracts", () => {
  it("accepts only HTTP targets", () => {
    expect(seoTargetCreateSchema.safeParse({ url: "https://example.com" }).success).toBe(true);
    expect(seoTargetCreateSchema.safeParse({ url: "file:///etc/passwd" }).success).toBe(false);
  });

  it("requires every core capability in a monitoring profile", () => {
    const result = seoMonitoringProfileInputSchema.safeParse({
      enabled_capabilities: ["technical", "content", "schema"]
    });
    expect(result.success).toBe(false);
  });

  it("requires a reason to dismiss a finding", () => {
    expect(
      seoFindingStatusUpdateSchema.safeParse({ version: 1, status: "dismissed" }).success
    ).toBe(false);
  });
});
