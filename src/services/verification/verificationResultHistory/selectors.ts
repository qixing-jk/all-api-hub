import {
  API_VERIFICATION_HISTORY_TARGET_KINDS,
  type ApiVerificationHistorySummary,
} from "~/services/verification/verificationResultHistory/types"

/** Finds the stored summary for one serialized target identity. */
export function selectLatestVerificationSummary(
  summaries: ApiVerificationHistorySummary[],
  targetKey: string,
) {
  for (const summary of summaries) {
    if (summary.targetKey === targetKey) {
      return summary
    }
  }

  return null
}
/** Projects stored summaries onto the requested target identities. */
export function selectLatestVerificationSummaries(
  summaries: ApiVerificationHistorySummary[],
  targetKeys: ReadonlySet<string>,
) {
  const byKey = new Map(
    summaries.map((summary) => [summary.targetKey, summary]),
  )

  const matched: Record<string, ApiVerificationHistorySummary> = {}

  for (const targetKey of targetKeys) {
    const summary = byKey.get(targetKey)
    if (summary) matched[targetKey] = summary
  }

  return matched
}
/** Selects the newest profile or profile-model result for each requested profile. */
export function selectLatestProfileVerificationSummaries(
  summaries: ApiVerificationHistorySummary[],
  profileKeyById: ReadonlyMap<string, string>,
) {
  const latestByProfileKey: Record<string, ApiVerificationHistorySummary> = {}

  for (const summary of summaries) {
    if (
      summary.target.kind !== API_VERIFICATION_HISTORY_TARGET_KINDS.Profile &&
      summary.target.kind !== API_VERIFICATION_HISTORY_TARGET_KINDS.ProfileModel
    ) {
      continue
    }

    const profileKey = profileKeyById.get(summary.target.profileId)
    if (!profileKey) continue

    const current = latestByProfileKey[profileKey]
    if (!current || summary.verifiedAt > current.verifiedAt) {
      latestByProfileKey[profileKey] = summary
    }
  }

  return latestByProfileKey
}
