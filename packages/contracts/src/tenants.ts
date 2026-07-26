import { z } from "zod";
import { isoDateTimeSchema, tenantIdSchema, uuidSchema } from "./common.js";

// Mirrors the check constraint on app.tenants.slug and app.organizations.slug.
export const slugSchema = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9-]+$/, "Use apenas letras minúsculas, números e hífens.");

// A stored timezone that Postgres or Intl cannot resolve breaks every date shown
// for the client, so it is rejected at the edge rather than on first render.
export const timezoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat("pt-BR", { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, "Fuso horário desconhecido.");

export const tenantStatusSchema = z.enum([
  "onboarding",
  "active",
  "suspended",
  "closing",
  "closed"
]);

export const tenantSchema = z
  .object({
    id: tenantIdSchema,
    organization_id: uuidSchema,
    organization_name: z.string().min(1).max(160),
    name: z.string().min(1).max(160),
    legal_name: z.string().max(200).nullable(),
    slug: z.string().min(1).max(80),
    status: tenantStatusSchema,
    industry: z.string().max(80).nullable(),
    country_code: z.string().length(2),
    timezone: z.string().min(1).max(64),
    locale: z.string().min(2).max(16),
    onboarding_step: z.number().int().min(0).max(8),
    created_at: isoDateTimeSchema,
    version: z.number().int().positive()
  })
  .strict();

export const tenantCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    legal_name: z.string().trim().max(200).nullable().default(null),
    // Omitted by the UI: the server derives it from the name and resolves collisions.
    slug: slugSchema.optional(),
    industry: z.string().trim().max(80).nullable().default(null),
    country_code: z
      .string()
      .trim()
      .length(2)
      .regex(/^[A-Z]{2}$/)
      .default("BR"),
    timezone: timezoneSchema.default("America/Sao_Paulo"),
    locale: z.string().trim().min(2).max(16).default("pt-BR"),
    // Null means "create a new organization", which then requires its own fields.
    organization_id: uuidSchema.nullable().default(null),
    organization_name: z.string().trim().min(1).max(160).optional(),
    billing_email: z.email().optional()
  })
  .strict()
  .superRefine((value, context) => {
    if (value.organization_id !== null) return;
    if (value.organization_name === undefined) {
      context.addIssue({
        code: "custom",
        path: ["organization_name"],
        message: "Informe o nome da nova organização."
      });
    }
    if (value.billing_email === undefined) {
      context.addIssue({
        code: "custom",
        path: ["billing_email"],
        message: "Informe o e-mail de cobrança da nova organização."
      });
    }
  });

export const tenantUpdateSchema = z
  .object({
    version: z.number().int().positive(),
    name: z.string().trim().min(1).max(160).optional(),
    legal_name: z.string().trim().max(200).nullable().optional(),
    industry: z.string().trim().max(80).nullable().optional(),
    timezone: timezoneSchema.optional(),
    locale: z.string().trim().min(2).max(16).optional(),
    status: tenantStatusSchema.optional(),
    onboarding_step: z.number().int().min(0).max(8).optional()
  })
  .strict();

export type Tenant = z.infer<typeof tenantSchema>;
export type TenantCreate = z.infer<typeof tenantCreateSchema>;
export type TenantUpdate = z.infer<typeof tenantUpdateSchema>;
export type TenantStatus = z.infer<typeof tenantStatusSchema>;
