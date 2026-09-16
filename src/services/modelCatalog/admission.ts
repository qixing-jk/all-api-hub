import { z } from "zod"

const groupNames = z.array(z.string())
const groupAccess = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("not-applicable") }),
  z.strictObject({
    kind: z.literal("authoritative"),
    usableGroups: groupNames,
  }),
  z.strictObject({
    kind: z.literal("compatible-priced-fallback"),
    candidateGroups: groupNames,
  }),
  z.strictObject({ kind: z.literal("unavailable") }),
])

const catalogFacts = z.object({
  data: z.array(z.object({ groupAccess: groupAccess.optional() })),
  groupAccess,
  groupRatios: z.record(z.string(), z.number().finite()),
})

/** Validate the cross-source evidence contract before storing or consuming it. */
export function hasValidCatalogFacts(value: unknown): boolean {
  return catalogFacts.safeParse(value).success
}
