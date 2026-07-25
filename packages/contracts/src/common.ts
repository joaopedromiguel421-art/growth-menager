import { z } from "zod";

export const uuidSchema = z.uuid();
export const requestIdSchema = z.string().min(8).max(128);
export const tenantIdSchema = uuidSchema;
export const isoDateTimeSchema = z.iso.datetime({ offset: true });

export const errorEnvelopeSchema = z
  .object({
    error: z.object({
      code: z.string().regex(/^GM-[A-Z]+-[A-Z0-9-]+$/),
      message: z.string().min(1),
      request_id: requestIdSchema,
      retryable: z.boolean(),
      details: z.record(z.string(), z.unknown()).optional()
    })
  })
  .strict();

export const cursorPageSchema = <T extends z.ZodType>(
  itemSchema: T
): z.ZodType<{
  data: z.output<T>[];
  next_cursor: string | null;
  has_more: boolean;
}> =>
  z
    .object({
      data: z.array(itemSchema),
      next_cursor: z.string().nullable(),
      has_more: z.boolean()
    })
    .strict();

export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;
