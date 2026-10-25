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
  useEffect(() => {
    let cancelled = false
    void loadProbePromptOverrides().then((overrides) => {
      if (cancelled) return
      setHasLoadedOverrides(true)
      setStoredOverrides(overrides)
      if (!hasEditedDraftRef.current) setPromptDraft(overrides)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(
    () => () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
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
      try {
        const normalized = normalizeProbePromptDraft(promptDraft)
        await saveProbePromptOverrides(promptDraft)
        setStoredOverrides(normalized)
        if (normalizeDraft) setPromptDraft(normalized)
      } catch (error) {
        setPromptSaveError(toSanitizedErrorSummary(error, []))
      } finally {
        setIsSavingPrompts(false)
      }
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
