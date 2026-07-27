import type { SeoCapabilityCode } from "@growth-manager/contracts";

export type SeoToolPort =
  | "safe_fetch"
  | "robots"
  | "html_parser"
  | "sitemap"
  | "external_renderer"
  | "page_speed"
  | "crux"
  | "gsc"
  | "ga4"
  | "gbp"
  | "dataforseo"
  | "openstreetmap"
  | "backlink_provider"
  | "serp_provider"
  | "ai_visibility_provider"
  | "snapshot_store";

export interface SeoCapabilityDefinition {
  readonly code: SeoCapabilityCode;
  readonly ruleVersion: string;
  readonly requiresAcquisition: boolean;
  readonly paid: boolean;
  readonly maxAttempts: 2 | 3;
  readonly allowedPorts: readonly SeoToolPort[];
  readonly aiMode: "none" | "optional_explanation";
}

const definitions: readonly SeoCapabilityDefinition[] = [
  {
    code: "technical",
    ruleVersion: "technical-v1",
    requiresAcquisition: true,
    paid: false,
    maxAttempts: 3,
    allowedPorts: ["safe_fetch", "robots", "html_parser"],
    aiMode: "optional_explanation"
  },
  {
    code: "content",
    ruleVersion: "content-v1",
    requiresAcquisition: true,
    paid: false,
    maxAttempts: 3,
    allowedPorts: ["html_parser", "gsc"],
    aiMode: "optional_explanation"
  },
  {
    code: "schema",
    ruleVersion: "schema-v1",
    requiresAcquisition: true,
    paid: false,
    maxAttempts: 3,
    allowedPorts: ["html_parser"],
    aiMode: "optional_explanation"
  },
  {
    code: "sitemap",
    ruleVersion: "sitemap-v1",
    requiresAcquisition: true,
    paid: false,
    maxAttempts: 3,
    allowedPorts: ["safe_fetch", "robots", "sitemap"],
    aiMode: "none"
  },
  {
    code: "performance",
    ruleVersion: "performance-v1",
    requiresAcquisition: true,
    paid: true,
    maxAttempts: 2,
    allowedPorts: ["page_speed", "crux"],
    aiMode: "optional_explanation"
  },
  {
    code: "visual",
    ruleVersion: "visual-v1",
    requiresAcquisition: true,
    paid: true,
    maxAttempts: 2,
    allowedPorts: ["external_renderer", "snapshot_store"],
    aiMode: "none"
  },
  {
    code: "google",
    ruleVersion: "google-v1",
    requiresAcquisition: false,
    paid: false,
    maxAttempts: 2,
    allowedPorts: ["gsc", "ga4", "gbp", "page_speed", "crux"],
    aiMode: "optional_explanation"
  },
  {
    code: "local",
    ruleVersion: "local-v1",
    requiresAcquisition: true,
    paid: false,
    maxAttempts: 3,
    allowedPorts: ["html_parser", "gbp"],
    aiMode: "optional_explanation"
  },
  {
    code: "maps",
    ruleVersion: "maps-v1",
    requiresAcquisition: false,
    paid: true,
    maxAttempts: 2,
    allowedPorts: ["dataforseo", "openstreetmap"],
    aiMode: "optional_explanation"
  },
  {
    code: "competitor",
    ruleVersion: "competitor-v1",
    requiresAcquisition: false,
    paid: true,
    maxAttempts: 2,
    allowedPorts: ["serp_provider", "safe_fetch"],
    aiMode: "optional_explanation"
  },
  {
    code: "backlink",
    ruleVersion: "backlink-v1",
    requiresAcquisition: false,
    paid: true,
    maxAttempts: 2,
    allowedPorts: ["backlink_provider", "safe_fetch"],
    aiMode: "optional_explanation"
  },
  {
    code: "ai_visibility",
    ruleVersion: "ai-visibility-v1",
    requiresAcquisition: false,
    paid: true,
    maxAttempts: 2,
    allowedPorts: ["ai_visibility_provider"],
    aiMode: "optional_explanation"
  },
  {
    code: "sxo",
    ruleVersion: "sxo-v1",
    requiresAcquisition: true,
    paid: true,
    maxAttempts: 2,
    allowedPorts: ["serp_provider", "html_parser"],
    aiMode: "optional_explanation"
  },
  {
    code: "drift",
    ruleVersion: "drift-v1",
    requiresAcquisition: true,
    paid: false,
    maxAttempts: 3,
    allowedPorts: ["snapshot_store"],
    aiMode: "optional_explanation"
  }
];

export const SEO_CAPABILITY_REGISTRY: ReadonlyMap<SeoCapabilityCode, SeoCapabilityDefinition> =
  new Map(definitions.map((definition) => [definition.code, definition]));

export function capabilityDefinition(code: SeoCapabilityCode): SeoCapabilityDefinition {
  const definition = SEO_CAPABILITY_REGISTRY.get(code);
  if (definition === undefined) throw new Error(`Unknown SEO capability: ${code}`);
  return definition;
}
