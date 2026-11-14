import { useCallback, useEffect, useRef, useState } from "react"

import { userPreferences } from "~/services/preferences/userPreferences"
import {
  DEFAULT_VERIFICATION_CONCURRENCY,
  normalizeVerificationConcurrency,
  type VerificationConcurrency,
} from "~/services/verification/concurrency"

export const VERIFICATION_CONCURRENCY_ERRORS = {
  Load: "load",
  Save: "save",
} as const
type VerificationConcurrencyError =
  (typeof VERIFICATION_CONCURRENCY_ERRORS)[keyof typeof VERIFICATION_CONCURRENCY_ERRORS]

/** Persist only this batch's setting, preserving other contexts' preferences. */
export function useVerificationConcurrency(
  kind: keyof VerificationConcurrency,
) {
  const [value, setValue] = useState(DEFAULT_VERIFICATION_CONCURRENCY)
  const [ready, setReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<VerificationConcurrencyError | null>(null)
  const mounted = useRef(false)
  const writing = useRef(false)
  const load = useCallback(async () => {
    try {
      const preferences = await userPreferences.getPreferencesStrict()
      if (!mounted.current) return
      setValue(
        normalizeVerificationConcurrency(
          preferences.verificationConcurrency?.[kind],
        ),
      )
      setReady(true)
      setError(null)
    } catch {
      if (mounted.current) setError(VERIFICATION_CONCURRENCY_ERRORS.Load)
    }
  }, [kind])
  useEffect(() => {
    mounted.current = true
    void load()
    return () => {
      mounted.current = false
    }
  }, [load])
  const update = useCallback(
    async (next: number) => {
      if (!ready || writing.current) return
      const normalized = normalizeVerificationConcurrency(next)
      setValue(normalized)
      setSaving(true)
      writing.current = true
      try {
        const result = await userPreferences.updateVerificationConcurrency({
          [kind]: normalized,
        })
        if (mounted.current)
          setError(result.ok ? null : VERIFICATION_CONCURRENCY_ERRORS.Save)
      } catch {
        if (mounted.current) setError(VERIFICATION_CONCURRENCY_ERRORS.Save)
      } finally {
        writing.current = false
        if (mounted.current) setSaving(false)
      }
    },
    [kind, ready],
  )
  return {
    kind,
    value,
    ready,
    saving,
    error,
    update,
    retry: () =>
      error === VERIFICATION_CONCURRENCY_ERRORS.Load ? load() : update(value),
  }
}
