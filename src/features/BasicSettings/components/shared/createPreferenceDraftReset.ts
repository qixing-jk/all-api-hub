import type { PreferenceWriteResult } from "~/services/preferences/userPreferences"
import { matchesDefaultSettings } from "~/utils/preferences/matchesDefaultSettings"

/** Reset persisted preferences before discarding their local connection draft. */
export function createPreferenceDraftReset<T extends object>({
  draft,
  storedValue,
  savedValue,
  defaults,
  reset,
  setDraft,
}: {
  draft: T
  storedValue: unknown
  savedValue: T
  defaults: Partial<T> | undefined
  reset: () => Promise<PreferenceWriteResult>
  setDraft: (value: T) => void
}) {
  return {
    resetDisabled:
      matchesDefaultSettings(draft, defaults) &&
      matchesDefaultSettings(storedValue, defaults),
    onReset: async () => {
      const result = await reset()
      if (result.ok) setDraft({ ...savedValue, ...defaults })
      return result
    },
  }
}
