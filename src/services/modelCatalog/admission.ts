import { z } from "zod"

import { MODEL_GROUP_ACCESS_EVIDENCE_KINDS } from "~/services/modelCatalog/snapshot"

const groupNames = z.array(z.string())
const groupAccess = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal(MODEL_GROUP_ACCESS_EVIDENCE_KINDS.NOT_APPLICABLE),
  }),
  z.strictObject({
    kind: z.literal(MODEL_GROUP_ACCESS_EVIDENCE_KINDS.AUTHORITATIVE),
    usableGroups: groupNames,
  }),
  z.strictObject({
    kind: z.literal(
      MODEL_GROUP_ACCESS_EVIDENCE_KINDS.COMPATIBLE_PRICED_FALLBACK,
    ),
    candidateGroups: groupNames,
  }),
  z.strictObject({
    kind: z.literal(MODEL_GROUP_ACCESS_EVIDENCE_KINDS.UNAVAILABLE),
  }),
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
