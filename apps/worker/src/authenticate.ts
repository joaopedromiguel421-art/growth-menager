import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyWorkerSignature(input: {
  readonly body: string;
  readonly timestamp: string | undefined;
  readonly signature: string | undefined;
  readonly secret: string;
  readonly now?: number;
}): boolean {
  if (input.timestamp === undefined || input.signature === undefined) return false;

  const timestamp = Number(input.timestamp);
  const now = input.now ?? Date.now();
  if (!Number.isFinite(timestamp) || Math.abs(now - timestamp) > 5 * 60 * 1000) return false;

  const expected = createHmac("sha256", input.secret)
    .update(`${input.timestamp}.${input.body}`)
    .digest("hex");
  const actualBuffer = Buffer.from(input.signature, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return (
    actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)
  );
}
