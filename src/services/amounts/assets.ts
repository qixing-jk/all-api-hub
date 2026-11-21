import { z } from "zod"

import { ASSET_KINDS } from "~/services/amounts/financialConstants"

/** Provider-scoped assets never become interchangeable through their labels. */
export const quotaAssetSchema = z.strictObject({
  id: z.string().trim().min(1),
  label: z.string().trim().min(1),
  displayScale: z.number().finite().positive(),
  displayLabel: z.string().trim().min(1),
})
export type QuotaAsset = z.infer<typeof quotaAssetSchema>

export const assetSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal(ASSET_KINDS.Currency),
    code: z.string().regex(/^[A-Z]{3}$/),
  }),
  quotaAssetSchema.extend({ kind: z.literal(ASSET_KINDS.Quota) }),
  z.strictObject({ kind: z.literal(ASSET_KINDS.Crypto), id: z.literal("XNO") }),
  z.strictObject({ kind: z.literal(ASSET_KINDS.Unknown) }),
])
export type Asset = z.infer<typeof assetSchema>

/** Identity deliberately excludes display labels and formatting scale. */
export function assetIdentity(asset: Asset): string {
  switch (asset.kind) {
    case ASSET_KINDS.Currency:
      return `currency:${asset.code}`
    case ASSET_KINDS.Quota:
      return `quota:${asset.id}`
    case ASSET_KINDS.Crypto:
      return `crypto:${asset.id}`
    case ASSET_KINDS.Unknown:
      return "unknown"
  }
}
