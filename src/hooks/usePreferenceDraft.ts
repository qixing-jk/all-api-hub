import { useEffect, useState } from "react"

type UsePreferenceDraftOptions<T> = {
  savedValue: T
  savedVersion: number
  /**
   * Optional comparator for `usePreferenceDraft`. Keep this callback stable
   * across renders, for example by defining it at module scope or memoizing it
   * with `useCallback`, because it participates in the reconciliation effect.
   */
  isEqual?: (left: T, right: T) => boolean
}

/**
 * Compare draft values with a serialization fallback for small settings objects.
 */
function defaultIsEqual<T>(left: T, right: T) {
  if (Object.is(left, right)) {
    return true
  }

  return JSON.stringify(left) === JSON.stringify(right)
}

/**
 * Manage a local settings draft against a persisted preference snapshot.
 *
 * Clean drafts rehydrate automatically from storage refreshes. Dirty drafts keep
 * their local edits and retain the version they branched from so stale writes can
 * be rejected safely.
 */
export function usePreferenceDraft<T>({
  savedValue,
  savedVersion,
  isEqual = defaultIsEqual,
}: UsePreferenceDraftOptions<T>) {
  const [draft, setDraft] = useState(savedValue)
  const [baselineValue, setBaselineValue] = useState(savedValue)
  const [baselineVersion, setBaselineVersion] = useState(savedVersion)

  const isDirty = !isEqual(draft, baselineValue)

  useEffect(() => {
    if (!isDirty) {
      setDraft(savedValue)
      setBaselineValue(savedValue)
      setBaselineVersion(savedVersion)
      return
    }

    if (isEqual(draft, savedValue)) {
      setBaselineValue(savedValue)
      setBaselineVersion(savedVersion)
    }
  }, [draft, isDirty, isEqual, savedValue, savedVersion])

  return {
    draft,
    setDraft,
    isDirty,
    expectedLastUpdated: baselineVersion,
  }
}
