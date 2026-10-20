import { z } from "zod"

/** Provider-scoped assets are never interchangeable merely because labels match. */
export const quotaAssetSchema = z.strictObject({
  id: z.string().trim().min(1),
  label: z.string().trim().min(1),
  displayScale: z.number().finite().positive(),
  displayLabel: z.string().trim().min(1),
})

export type QuotaAsset = z.infer<typeof quotaAssetSchema>

/** Stored amounts are atomic; scaling belongs only at the display boundary. */
export function formatQuotaAmount(
  amount: number,
  asset: QuotaAsset,
  locale?: string,
) {
  return `${new Intl.NumberFormat(locale, { maximumSignificantDigits: 15 }).format(amount / asset.displayScale)} ${asset.displayLabel}`
}
