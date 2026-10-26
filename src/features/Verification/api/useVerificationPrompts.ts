import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import {
  EDITABLE_PROBE_PROMPT_IDS,
  getDefaultProbePrompt,
} from "~/services/verification/aiApiVerification/probes/probePrompts"
import { toSanitizedErrorSummary } from "~/services/verification/aiApiVerification/utils"
import { PELICAN_TEST_PROMPT } from "~/services/verification/modelQuality/pelican"
import {
  loadProbePromptOverrides,
  normalizeProbePromptDraft,
  PELICAN_PROMPT_ID,
  saveProbePromptOverrides,
  type ProbePromptDraft,
  type ProbePromptOverrides,
  type VerificationPromptId,
} from "~/services/verification/promptOverrides"

const EDITABLE_VERIFICATION_PROMPT_IDS: readonly VerificationPromptId[] = [
  ...EDITABLE_PROBE_PROMPT_IDS,
  PELICAN_PROMPT_ID,
]
const PROMPT_AUTO_SAVE_DELAY_MS = 250

/** Compare normalized override maps without depending on key order. */
function isSameProbePromptOverrides(
  left: ProbePromptOverrides,
  right: ProbePromptOverrides,
): boolean {
  const leftKeys = Object.keys(left)
  if (leftKeys.length !== Object.keys(right).length) return false
  return leftKeys.every(
    (key) =>
      left[key as VerificationPromptId] === right[key as VerificationPromptId],
  )
}

/** Owns shared prompt drafts, resets and persistence independently of drawing runs. */
export function useVerificationPrompts() {
  const [storedOverrides, setStoredOverrides] = useState<ProbePromptOverrides>(
    {},
  )
  const [promptDraft, setPromptDraft] = useState<ProbePromptDraft>({})
  const [isSavingPrompts, setIsSavingPrompts] = useState(false)
  const [promptSaveError, setPromptSaveError] = useState<string | null>(null)

  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Prompts are shared across entry points, so they load once per dialog mount
  // rather than per verification target. A load that lands after the user typed
  // an edit must not clobber the draft.
  const [hasLoadedOverrides, setHasLoadedOverrides] = useState(false)
  const hasEditedDraftRef = useRef(false)
  // Read when the dialog closes, which can happen while the debounce is still
  // running. Assigned from an effect rather than during render so a render React
  // discards cannot leave a draft here that was never shown.
  const latestDraftRef = useRef<ProbePromptDraft>({})
  // Normalized overrides the last successful write persisted. `null` means the
  // stored value is still unknown, so closing must not write over it.
  const persistedOverridesRef = useRef<ProbePromptOverrides | null>(null)
  // The write in flight, so a closing save can queue behind it instead of racing.
  const inFlightWriteRef = useRef<Promise<void> | null>(null)
  useEffect(() => {
    latestDraftRef.current = promptDraft
  }, [promptDraft])
  useEffect(() => {
    let cancelled = false
    void loadProbePromptOverrides().then((overrides) => {
      if (cancelled) return
      setHasLoadedOverrides(true)
      setStoredOverrides(overrides)
      persistedOverridesRef.current = overrides
      if (!hasEditedDraftRef.current) setPromptDraft(overrides)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(
    () => () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current)
        autoSaveTimerRef.current = null
      }
      if (!persistedOverridesRef.current) return
      // A pending write of an older draft would otherwise land after this one and
      // win, so the closing save waits for it and re-checks what it persisted.
      void (inFlightWriteRef.current ?? Promise.resolve())
        .catch(() => undefined)
        .then(async () => {
          const persisted = persistedOverridesRef.current
          const latest = latestDraftRef.current
          if (!persisted) return
          const normalized = normalizeProbePromptDraft(latest)
          if (isSameProbePromptOverrides(normalized, persisted)) return
          try {
            await saveProbePromptOverrides(latest)
            persistedOverridesRef.current = normalized
          } catch {
            // There is no dialog left to report a failure to.
          }
        })
    },
    [],
  )
  const setPromptDraftValue = useCallback(
    (probeId: VerificationPromptId, value: string) => {
      hasEditedDraftRef.current = true
      setPromptDraft((current) => ({ ...current, [probeId]: value }))
    },
    [],
  )

  const resetPrompt = useCallback((probeId: VerificationPromptId) => {
    hasEditedDraftRef.current = true
    setPromptDraft((current) => {
      const next = { ...current }
      delete next[probeId]
      return next
    })
  }, [])

  const resetAllPrompts = useCallback(() => {
    hasEditedDraftRef.current = true
    setPromptDraft({})
  }, [])

  const persistPrompts = useCallback(
    async (normalizeDraft: boolean) => {
      setIsSavingPrompts(true)
      setPromptSaveError(null)
      const draftToSave = promptDraft
      const normalized = normalizeProbePromptDraft(draftToSave)
      // Started in a microtask so a synchronous failure becomes a rejection
      // rather than escaping the caller that only tracks the returned promise.
      const write = Promise.resolve()
        .then(() => saveProbePromptOverrides(draftToSave))
        .then(() => {
          persistedOverridesRef.current = normalized
          setStoredOverrides(normalized)
          if (normalizeDraft) setPromptDraft(normalized)
        })
        .catch((error: unknown) => {
          setPromptSaveError(toSanitizedErrorSummary(error, []))
        })
        .finally(() => {
          if (inFlightWriteRef.current === write)
            inFlightWriteRef.current = null
          setIsSavingPrompts(false)
        })
      inFlightWriteRef.current = write
      await write
    },
    [promptDraft],
  )

  const savePrompts = useCallback(() => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current)
      autoSaveTimerRef.current = null
    }
    void persistPrompts(true)
  }, [persistPrompts])

  const isPromptsDirty = useMemo(() => {
    const normalizedDraft = normalizeProbePromptDraft(promptDraft)
    const draftKeys = Object.keys(normalizedDraft)
    const storedKeys = Object.keys(storedOverrides)
    if (draftKeys.length !== storedKeys.length) return true
    return draftKeys.some(
      (key) =>
        normalizedDraft[key as VerificationPromptId] !==
        storedOverrides[key as VerificationPromptId],
    )
  }, [promptDraft, storedOverrides])

  // Automatically save debounced prompt edits after the user stops typing.
  useEffect(() => {
    if (!hasLoadedOverrides || !hasEditedDraftRef.current) return
    if (!isPromptsDirty) return

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current)
    }

    autoSaveTimerRef.current = setTimeout(() => {
      autoSaveTimerRef.current = null
      void persistPrompts(false)
    }, PROMPT_AUTO_SAVE_DELAY_MS)

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current)
      }
    }
  }, [persistPrompts, isPromptsDirty, hasLoadedOverrides])

  const getDefaultPrompt = useCallback(
    (probeId: VerificationPromptId): string | null => {
      if (probeId === PELICAN_PROMPT_ID) {
        return PELICAN_TEST_PROMPT
      }
      return getDefaultProbePrompt(probeId)
    },
    [],
  )

  return useMemo(
    () => ({
      promptIds: EDITABLE_VERIFICATION_PROMPT_IDS,
      promptDraft,
      isPromptsDirty,
      isSavingPrompts,
      promptSaveError,
      promptOverrides: storedOverrides,
      setPromptDraftValue,
      resetPrompt,
      resetAllPrompts,
      savePrompts,
      getDefaultPrompt,
    }),
    [
      promptDraft,
      isPromptsDirty,
      isSavingPrompts,
      promptSaveError,
      storedOverrides,
      setPromptDraftValue,
      resetPrompt,
      resetAllPrompts,
      savePrompts,
      getDefaultPrompt,
    ],
  )
}
