import { useEffect, useRef, useState } from "react"

import { toSanitizedErrorSummary } from "~/services/verification/aiApiVerification/utils"
import type { ContextCapacityResult } from "~/services/verification/modelQuality/contextCapacity"
import {
  CONTEXT_CAPACITY_REASONS,
  CONTEXT_CHECKPOINT_LIMIT_ERROR_NAME,
} from "~/services/verification/modelQuality/contextCapacityConstants"
import {
  runContextCapacity,
  type ContextCapacityRunResult,
} from "~/services/verification/modelQuality/contextCapacityRun"
import {
  contextCapacityHistory,
  getContextCapacityRequestIdentity,
  type ContextCapacityHistoryAccess,
} from "~/services/verification/verificationResultHistory/contextCapacityHistory"
import type {
  ApiVerificationHistoryTarget,
  ContextCapacitySummary,
} from "~/services/verification/verificationResultHistory/types"

import type { VerificationToolRequestParams } from "./useVerificationTools"

/** Own a cancellable capacity measurement for exactly one dialog configuration. */
export function useContextCapacity(options: {
  enabled: boolean
  blocked: boolean
  contextKey: string
  resolveRequest: (
    signal: AbortSignal,
  ) => Promise<VerificationToolRequestParams | null>
  resolveHistoryRequest?: (
    signal: AbortSignal,
  ) => Promise<VerificationToolRequestParams | null>
  runner?: typeof runContextCapacity
  historyAccess?: ContextCapacityHistoryAccess
  historyTarget?: ApiVerificationHistoryTarget | null
  discardCheckpoints?: () => Promise<void>
}) {
  const [checkpointLimitReached, setCheckpointLimitReached] = useState(false)
  const [discardingCheckpoints, setDiscardingCheckpoints] = useState(false)
  const [history, setHistory] = useState<ContextCapacitySummary | null>(null)
  const [historyError, setHistoryError] = useState(false)
  const generation = useRef(0)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<ContextCapacityRunResult | null>(null)
  const [progress, setProgress] = useState<ContextCapacityResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [stopped, setStopped] = useState(false)
  const active = useRef<AbortController | null>(null)
  const resultScope = useRef<string | null>(null)
  const key = useRef(options.contextKey)
  const latestOptions = useRef(options)
  latestOptions.current = options
  key.current = options.contextKey
  useEffect(() => {
    const configuration = latestOptions.current
    const loadVersion = ++generation.current
    const loadController = new AbortController()
    setHistory(null)
    setHistoryError(false)
    setResult(null)
    setProgress(null)
    setError(null)
    setStopped(false)
    setRunning(false)
    setCheckpointLimitReached(false)
    setDiscardingCheckpoints(false)
    if (configuration.enabled)
      void (async () => {
        try {
          if (!configuration.historyTarget && !configuration.historyAccess)
            return
          const request = await (
            configuration.resolveHistoryRequest ?? configuration.resolveRequest
          )(loadController.signal)
          if (!request || loadController.signal.aborted) return
          const previous = await (
            configuration.historyAccess ?? contextCapacityHistory
          ).get(request, configuration.historyTarget ?? undefined)
          if (
            !loadController.signal.aborted &&
            generation.current === loadVersion
          )
            setHistory(previous)
        } catch {
          if (
            !loadController.signal.aborted &&
            generation.current === loadVersion
          )
            setHistoryError(true)
        }
      })()
    return () => {
      generation.current += 1
      loadController.abort()
      active.current?.abort()
      active.current = null
    }
  }, [options.contextKey, options.enabled])
  return {
    enabled: options.enabled,
    running,
    canRun:
      options.enabled &&
      !options.blocked &&
      !running &&
      !discardingCheckpoints &&
      !checkpointLimitReached,
    checkpointLimitReached,
    discardingCheckpoints,
    discardCheckpoints: options.discardCheckpoints
      ? () => {
          if (active.current || discardingCheckpoints) return
          const context = key.current
          const version = ++generation.current
          const current = () =>
            context === key.current && generation.current === version
          setDiscardingCheckpoints(true)
          void options.discardCheckpoints!()
            .then(() => {
              if (!current()) return
              setCheckpointLimitReached(false)
              setError(null)
            })
            .catch((failure) => {
              if (current()) setError(toSanitizedErrorSummary(failure, []))
            })
            .finally(() => {
              if (current()) setDiscardingCheckpoints(false)
            })
        }
      : undefined,
    result,
    progress,
    error,
    history,
    historyError,
    stopped,
    clearHistory: () => {
      if (key.current !== options.contextKey) return
      generation.current += 1
      active.current?.abort()
      active.current = null
      setRunning(false)
      setHistory(null)
      setHistoryError(false)
      setResult(null)
      setProgress(null)
      setError(null)
      setStopped(false)
      setCheckpointLimitReached(false)
      setDiscardingCheckpoints(false)
    },
    stop: () => {
      active.current?.abort()
      active.current = null
      setRunning(false)
      setStopped(true)
    },
    run: () => {
      if (
        !options.enabled ||
        options.blocked ||
        active.current ||
        discardingCheckpoints ||
        checkpointLimitReached
      )
        return
      const runVersion = ++generation.current
      const targetToSave = options.historyTarget ?? undefined
      const resumeFrom =
        result?.reason === CONTEXT_CAPACITY_REASONS.Budget ? result : undefined
      const controller = new AbortController()
      active.current = controller
      const context = key.current
      const current = () =>
        active.current === controller && context === key.current
      const saveHistory = (
        request: VerificationToolRequestParams,
        response: ContextCapacityRunResult | null,
      ) => {
        if (!targetToSave && !options.historyAccess) return
        void (options.historyAccess ?? contextCapacityHistory)
          .save(request, response, targetToSave)
          .then((saved) => {
            if (generation.current === runVersion && key.current === context)
              setHistory(saved)
          })
          .catch(() => {
            if (generation.current === runVersion && key.current === context)
              setHistoryError(true)
          })
      }
      setRunning(true)
      setResult(null)
      setProgress(resumeFrom ?? null)
      setError(null)
      setStopped(false)
      setHistoryError(false)
      setHistory(null)
      let secrets: string[] = []
      let runRequest: VerificationToolRequestParams | null = null
      let continuationForRun: ContextCapacityRunResult | undefined
      void (async () => {
        try {
          const request = await options.resolveRequest(controller.signal)
          controller.signal.throwIfAborted()
          if (!request || !current()) return
          secrets = request.secrets
          runRequest = request
          const scope = getContextCapacityRequestIdentity(request)
          if (!current() || controller.signal.aborted) return
          continuationForRun =
            resultScope.current === scope ? resumeFrom : undefined
          const response = await (options.runner ?? runContextCapacity)({
            ...request,
            resumeFrom: continuationForRun,
            abortSignal: controller.signal,
            onProgress: (value) => {
              if (current() && !controller.signal.aborted) setProgress(value)
            },
          })
          if (current() && !controller.signal.aborted) {
            resultScope.current = scope
            setResult(response)
            saveHistory(request, response)
          }
        } catch (failure) {
          const checkpointLimit =
            failure instanceof Error &&
            failure.name === CONTEXT_CHECKPOINT_LIMIT_ERROR_NAME
          if (current() && !controller.signal.aborted) {
            setCheckpointLimitReached(checkpointLimit)
            if (checkpointLimit) {
              // No provider request was dispatched: keep the accepted ledger so
              // cleanup can resume it without repeating completed paid attempts.
              setResult(continuationForRun ?? null)
              setProgress(null)
            }
          }
          if (current() && !controller.signal.aborted)
            setError(toSanitizedErrorSummary(failure, secrets))
          if (
            current() &&
            !controller.signal.aborted &&
            runRequest &&
            !checkpointLimit
          ) {
            saveHistory(runRequest, null)
          }
        } finally {
          if (current()) {
            setStopped(controller.signal.aborted)
            setRunning(false)
            active.current = null
          }
        }
      })()
    },
  }
}

export type ContextCapacityController = Omit<
  ReturnType<typeof useContextCapacity>,
  | "history"
  | "historyError"
  | "clearHistory"
  | "checkpointLimitReached"
  | "discardingCheckpoints"
  | "discardCheckpoints"
> & {
  history?: ContextCapacitySummary | null
  historyError?: boolean
  checkpointLimitReached?: boolean
  discardingCheckpoints?: boolean
  discardCheckpoints?: () => void
}
