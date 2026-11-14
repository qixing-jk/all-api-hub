import { useCallback, useEffect, useRef, useState } from "react"

import { userPreferences } from "~/services/preferences/userPreferences"
import type { VerificationGenerationProgress } from "~/services/verification/aiApiVerification/generationProgress"
import { toSanitizedErrorSummary } from "~/services/verification/aiApiVerification/utils"
import {
  runQuestionAnswerTest,
  type QuestionAnswerResult,
  type QuestionAnswerSettings,
} from "~/services/verification/modelQuality/questionAnswer"
import {
  DEFAULT_QUESTION_ANSWER_SETTINGS,
  normalizeQuestionAnswerSettings,
} from "~/services/verification/modelQuality/questionAnswerSettings"

import {
  VERIFICATION_SETTINGS_ERROR_PHASES,
  VERIFICATION_TOOL_STATUSES,
  type VerificationSettingsErrorPhase,
  type VerificationToolStatus,
} from "./types"
import type { VerificationToolRequestParams } from "./verificationToolRequestTypes"

type Options = {
  contextKey: string
  enabled: boolean
  blocked: boolean
  resolveRequest: (
    signal: AbortSignal,
  ) => Promise<VerificationToolRequestParams | null>
  runner?: typeof runQuestionAnswerTest
}

/** Owns question drafts and one cancellable run for the current credential context. */
export function useQuestionAnswerTest({
  contextKey,
  enabled,
  blocked,
  resolveRequest,
  runner = runQuestionAnswerTest,
}: Options) {
  const [settings, setSettings] = useState(DEFAULT_QUESTION_ANSWER_SETTINGS)
  const [ready, setReady] = useState(false)
  const [saveError, setSaveError] =
    useState<VerificationSettingsErrorPhase | null>(null)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<VerificationToolStatus>(
    VERIFICATION_TOOL_STATUSES.Idle,
  )
  const [result, setResult] = useState<QuestionAnswerResult | null>(null)
  const [progress, setProgress] = useState<VerificationGenerationProgress>()
  const [startedAt, setStartedAt] = useState<number>()
  const [error, setError] = useState<string | null>(null)
  const active = useRef<AbortController | null>(null)
  const mounted = useRef(false)
  const pending = useRef<Partial<QuestionAnswerSettings>>({})
  const writes = useRef(Promise.resolve())
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const loadGeneration = useRef(0)

  const saveSettings = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    if (!Object.keys(pending.current).length) return writes.current
    if (mounted.current) {
      setSaving(true)
      setSaveError(null)
    }
    const write = writes.current
      .then(async () => {
        const patch = pending.current
        if (!Object.keys(patch).length) return
        pending.current = {}
        try {
          const saved = await userPreferences.updateQuestionAnswerTest(patch)
          if (!saved.ok) throw new Error("Unable to save question settings")
          if (mounted.current) setSaveError(null)
        } catch {
          pending.current = { ...patch, ...pending.current }
          if (mounted.current)
            setSaveError(VERIFICATION_SETTINGS_ERROR_PHASES.Save)
        }
      })
      .finally(() => {
        if (mounted.current && writes.current === write) setSaving(false)
      })
    writes.current = write
    return write
  }, [])

  const loadSettings = useCallback(() => {
    const generation = ++loadGeneration.current
    setSaveError(null)
    return userPreferences
      .getPreferencesStrict()
      .then((preferences) => {
        if (!mounted.current || generation !== loadGeneration.current) return
        setSettings(
          normalizeQuestionAnswerSettings(preferences.questionAnswerTest),
        )
        setReady(true)
      })
      .catch(() => {
        if (mounted.current && generation === loadGeneration.current)
          setSaveError(VERIFICATION_SETTINGS_ERROR_PHASES.Load)
      })
  }, [])

  useEffect(() => {
    mounted.current = true
    void loadSettings()
    return () => {
      loadGeneration.current += 1
      mounted.current = false
      void saveSettings()
    }
  }, [saveSettings, loadSettings])

  useEffect(() => {
    active.current?.abort()
    active.current = null
    setStatus(VERIFICATION_TOOL_STATUSES.Idle)
    setResult(null)
    setProgress(undefined)
    setStartedAt(undefined)
    setError(null)
    return () => {
      active.current?.abort()
      active.current = null
    }
  }, [contextKey, enabled])

  const updateSettings = useCallback(
    (patch: Partial<QuestionAnswerSettings>) => {
      if (!ready || active.current) return
      setSettings((current) => ({ ...current, ...patch }))
      pending.current = { ...pending.current, ...patch }
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        void saveSettings()
      }, 250)
    },
    [ready, saveSettings],
  )

  const running = status === VERIFICATION_TOOL_STATUSES.Running
  const canRun =
    enabled &&
    !blocked &&
    ready &&
    Boolean(settings.question.trim()) &&
    !running
  const run = useCallback(() => {
    if (!canRun || active.current) return
    const controller = new AbortController()
    active.current = controller
    const snapshot = { ...settings }
    setStatus(VERIFICATION_TOOL_STATUSES.Running)
    setProgress(undefined)
    setStartedAt(Date.now())
    setResult(null)
    setError(null)
    let secrets: string[] = []
    void (async () => {
      try {
        const request = await resolveRequest(controller.signal)
        if (active.current !== controller) return
        if (!request) {
          setStatus(VERIFICATION_TOOL_STATUSES.Idle)
          return
        }
        secrets = request.secrets
        controller.signal.throwIfAborted()
        const answer = await runner({
          ...request,
          ...snapshot,
          onProgress: (progress) => {
            if (active.current === controller && !controller.signal.aborted)
              setProgress(progress)
          },
          abortSignal: controller.signal,
        })
        if (active.current !== controller || controller.signal.aborted) return
        setResult(answer)
        setStatus(VERIFICATION_TOOL_STATUSES.Done)
      } catch (cause) {
        if (active.current !== controller) return
        if (controller.signal.aborted)
          setStatus(VERIFICATION_TOOL_STATUSES.Stopped)
        else {
          setError(toSanitizedErrorSummary(cause, secrets))
          setStatus(VERIFICATION_TOOL_STATUSES.Error)
        }
      } finally {
        if (active.current === controller) active.current = null
      }
    })()
  }, [canRun, resolveRequest, runner, settings])

  const stop = useCallback(() => {
    active.current?.abort()
    active.current = null
    setStatus(VERIFICATION_TOOL_STATUSES.Stopped)
  }, [])

  return {
    settings,
    updateSettings,
    saveSettings,
    loadSettings,
    ready,
    saving,
    saveError,
    status,
    running,
    result,
    progress,
    startedAt,
    error,
    canRun,
    run,
    stop,
  }
}

export type QuestionAnswerController = ReturnType<typeof useQuestionAnswerTest>
