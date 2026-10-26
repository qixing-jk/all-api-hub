/**
 * Reads and writes the user's probe prompt overrides.
 *
 * One preference object feeds every verification entry point, so an edit made in
 * one dialog applies to all of them. Blank entries are stored as removed keys
 * rather than empty strings, which keeps "reset to default" a real deletion.
 */
import {
  PREFERENCE_WRITE_FAILURE_TYPES,
  type PreferenceWriteFailure,
} from "~/services/preferences/preferencesStore"
import { userPreferences } from "~/services/preferences/userPreferences"
import {
  EDITABLE_PROBE_PROMPT_IDS,
  getDefaultProbePrompt,
} from "~/services/verification/aiApiVerification/probes/probePrompts"
import type { ApiVerificationProbeId } from "~/services/verification/aiApiVerification/types"
import { PELICAN_PROMPT_ID } from "~/services/verification/modelQuality/constants"
import { PELICAN_TEST_PROMPT } from "~/services/verification/modelQuality/pelican"

export { PELICAN_PROMPT_ID } from "./modelQuality/constants"
export type VerificationPromptId =
  | ApiVerificationProbeId
  | typeof PELICAN_PROMPT_ID

export type ProbePromptDraft = Partial<Record<VerificationPromptId, string>>
export type ProbePromptOverrides = Partial<Record<VerificationPromptId, string>>

/**
 * Keep only editable probes whose override differs from the built-in prompt.
 * Storing an identical value would freeze the default if it later changes.
 */
export function normalizeProbePromptDraft(
  draft: ProbePromptDraft,
): ProbePromptOverrides {
  const next: ProbePromptOverrides = {}

  for (const probeId of EDITABLE_PROBE_PROMPT_IDS) {
    const value = draft[probeId]
    const trimmed = typeof value === "string" ? value.trim() : ""
    if (!trimmed) continue
    if (trimmed === getDefaultProbePrompt(probeId)) continue
    next[probeId] = trimmed
  }

  const pelicanValue = draft[PELICAN_PROMPT_ID]
  const trimmedPelican =
    typeof pelicanValue === "string" ? pelicanValue.trim() : ""
  if (trimmedPelican && trimmedPelican !== PELICAN_TEST_PROMPT) {
    next[PELICAN_PROMPT_ID] = trimmedPelican
  }

  return next
}

/**
 * Read the stored overrides, tolerating a malformed or missing value.
 */
export async function loadProbePromptOverrides(): Promise<ProbePromptOverrides> {
  try {
    const preferences = await userPreferences.getPreferences()
    return normalizeProbePromptDraft(preferences.verificationProbePrompts ?? {})
  } catch {
    return {}
  }
}

/**
 * Persist the overrides shared by every verification entry point.
 *
 * Prompt saving has no optimistic-concurrency contract, so its callers take the
 * dialog's existing thrown-error path: a typed write failure must not be dropped
 * or the UI reports a save that never happened.
 */
export async function saveProbePromptOverrides(
  draft: ProbePromptDraft,
): Promise<void> {
  const result = await userPreferences.setVerificationProbePrompts(
    normalizeProbePromptDraft(draft),
  )
  if (!result.ok) throw toProbePromptWriteError(result.reason)
}

/**
 * Recover the failure behind a typed write result. Storage errors keep their
 * original error so the caller renders the same text a thrown write would.
 */
function toProbePromptWriteError(failure: PreferenceWriteFailure): unknown {
  if (failure.type === PREFERENCE_WRITE_FAILURE_TYPES.StorageError) {
    return failure.error
  }

  return new Error(
    `probe prompt write rejected (${failure.type}): expected lastUpdated ${failure.expectedLastUpdated}, found ${failure.actualLastUpdated}`,
  )
}
