import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { toSanitizedErrorSummary } from "~/services/verification/aiApiVerification/utils"
import { CONTEXT_CHECKPOINT_LIMIT_ERROR_NAME } from "~/services/verification/modelQuality/contextCapacityConstants"
import { getModelContextInfo } from "~/services/verification/modelQuality/contextTokens"
import type { ContextCounterInfo } from "~/services/verification/modelQuality/contextTokens"
import {
  NEEDLE_DEFAULTS,
  NEEDLE_RUN_REASONS,
} from "~/services/verification/modelQuality/needleConstants"
import {
  createNeedlePlan,
  expandNeedlePlan,
  getNeedleInputReference,
  isSameNeedleCoordinate,
  selectNeedleCells,
  type NeedleCapacityEvidence,
  type NeedleCoordinate,
  type NeedleSelection,
} from "~/services/verification/modelQuality/needlePlan"
import type {
  NeedleResult,
  NeedleRunControls,
  RunNeedleParams,
} from "~/services/verification/modelQuality/needleRun"
import {
  getNeedleScopeKey,
  needleHistory,
  type NeedleHistoryAccess,
} from "~/services/verification/verificationResultHistory/needleHistory"
import type { ApiVerificationHistoryTarget } from "~/services/verification/verificationResultHistory/types"
import { LONG_CONTEXT_ERROR_NAMES } from "~/services/verification/webAiApiCheck/longContextConstants"
import { runNeedleInBackground } from "~/services/verification/webAiApiCheck/needleClient"

import {
  MASKED_CONTEXT_HISTORY_REQUEST,
  type ContextCapacityHistoryRequestResolver,
} from "./useContextCapacity"
import type { VerificationToolRequestParams } from "./useVerificationTools"

export type NeedleRunner = (
  params: RunNeedleParams,
  target?: ApiVerificationHistoryTarget,
) => Promise<NeedleResult>
const defaultRunner: NeedleRunner = runNeedleInBackground

type Options = {
  enabled: boolean
  blocked: boolean
  contextKey: string
  modelId: string
  resolveRequest: (
    signal: AbortSignal,
  ) => Promise<VerificationToolRequestParams | null>
  resolveHistoryRequest?: ContextCapacityHistoryRequestResolver
  loadCounter?: typeof getModelContextInfo
  historyAccess?: NeedleHistoryAccess
  historyTarget?: ApiVerificationHistoryTarget | null
  runner?: NeedleRunner
  capacity?: NeedleCapacityEvidence | null
  discardCheckpoints?: () => Promise<unknown>
}

/** An independently cancellable test; planning never resolves a hidden credential. */
export function useNeedleTest(options: Options) {
  const { t } = useTranslation("aiApiVerification")
  const [counter, setCounter] = useState<ContextCounterInfo | null>(null)
  const [result, setResult] = useState<NeedleResult | null>(null)
  const [historical, setHistorical] = useState(false)
  const [running, setRunning] = useState(false)
  const [controls, setControls] = useState<NeedleRunControls | null>(null)
  const [stopError, setStopError] = useState<NeedleSelection | null>(null)
  const [execution, setExecution] = useState<{
    cells: NeedleCoordinate[]
    selection?: NeedleSelection
    settled?: boolean
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [checkpointError, setCheckpointError] = useState(false)
  const [historyError, setHistoryError] = useState(false)
  const [limitDraft, setLimitDraft] = useState("")
  const [seedDraft, setSeedDraft] = useState("")
  const [quick, setQuick] = useState(true)
  const [reload, setReload] = useState(0)
  const generation = useRef(0)
  const active = useRef<AbortController | null>(null)
  const latest = useRef(options)
  latest.current = options
  const observed = useRef<NeedleResult | null>(null)
  // Local cancellation/progress snapshots are not accepted persistence baselines.
  const resumable = useRef<NeedleResult | null>(null)
  const resultScope = useRef<string | null>(null)
  useEffect(() => {
    const version = ++generation.current
    const controller = new AbortController()
    const configuration = latest.current
    const current = () =>
      !controller.signal.aborted && version === generation.current
    active.current?.abort()
    active.current = null
    observed.current = null
    resumable.current = null
    resultScope.current = null
    setCounter(null)
    setResult(null)
    setRunning(false)
    setControls(null)
    setStopError(null)
    setExecution(null)
    setError(null)
    setCheckpointError(false)
    setHistorical(false)
    setHistoryError(false)
    setLimitDraft("")
    setSeedDraft("")
    if (configuration.enabled && configuration.modelId) {
      void (configuration.loadCounter ?? getModelContextInfo)(
        configuration.modelId,
      )
        .then((info) => {
          if (current()) setCounter(info)
        })
        .catch(() => {
          if (current())
            setError(t("verifyDialog.tools.needle.errors.metadata"))
        })
      void (async () => {
        try {
          const request = await (
            configuration.resolveHistoryRequest ?? configuration.resolveRequest
          )(controller.signal)
          if (
            !request ||
            request === MASKED_CONTEXT_HISTORY_REQUEST ||
            !current()
          )
            return
          const saved = await (
            configuration.historyAccess ?? needleHistory
          ).get(request, configuration.historyTarget ?? undefined)
          const scope = await getNeedleScopeKey(request)
          if (current() && saved) {
            resumable.current = saved.result
            resultScope.current = scope
            setResult(saved.result)
            setHistorical(true)
          }
        } catch {
          if (current()) setHistoryError(true)
        }
      })()
    }
    return () => {
      controller.abort()
      active.current?.abort()
      generation.current += 1
    }
  }, [options.contextKey, options.modelId, options.enabled, reload, t])

  const planning = useMemo(() => {
    if (!counter) return { plan: null, invalid: false }
    try {
      const seed = seedDraft.trim() ? Number(seedDraft) : 0
      if (
        !Number.isSafeInteger(seed) ||
        seed < 0 ||
        seed > NEEDLE_DEFAULTS.maxSeed
      )
        throw new Error("Invalid seed")
      return {
        plan: createNeedlePlan({
          counter,
          capacity: options.capacity,
          maxInputTokens: limitDraft.trim() ? Number(limitDraft) : undefined,
          quick,
        }),
        invalid: false,
      }
    } catch {
      return { plan: null, invalid: true }
    }
  }, [counter, options.capacity, limitDraft, seedDraft, quick])

  const canRun =
    options.enabled && !options.blocked && !running && Boolean(planning.plan)
  const run = async (selection?: NeedleSelection) => {
    if (!canRun || active.current || !planning.plan) return
    const controller = new AbortController()
    active.current = controller
    const version = ++generation.current
    const current = () => version === generation.current
    const configuration = latest.current
    const previous = selection ? resumable.current : null
    const approvedPlan = selection
      ? expandNeedlePlan(previous?.plan ?? planning.plan)
      : planning.plan
    const cells = selectNeedleCells(
      approvedPlan,
      selection,
      previous?.cells,
    ).cells
    const seed =
      previous?.seed ??
      (seedDraft.trim()
        ? Number(seedDraft)
        : crypto.getRandomValues(new Uint32Array(1))[0]!)
    let receivedProgress = false
    let remoteControls: NeedleRunControls | undefined
    const cancelledCells: NeedleCoordinate[] = []
    const queuedSelections: NeedleSelection[] = []
    setExecution({ cells, selection })
    setRunning(true)
    setStopError(null)
    setControls({
      stopSelection: async (scope) => {
        if (!current() || controller.signal.aborted) return false
        if (remoteControls) return remoteControls.stopSelection(scope)
        const selected = selectNeedleCells(approvedPlan, scope).cells
        const cancelled = cells.filter(
          (cell) =>
            selected.some((item) => isSameNeedleCoordinate(item, cell)) &&
            !cancelledCells.includes(cell),
        )
        if (!cancelled.length) return false
        cancelledCells.push(...cancelled)
        queuedSelections.push(scope)
        const snapshot: NeedleResult = {
          version: NEEDLE_DEFAULTS.version,
          seed,
          plan: approvedPlan,
          counter: previous?.counter ?? counter!,
          reason:
            cancelledCells.length === cells.length
              ? NEEDLE_RUN_REASONS.Stopped
              : NEEDLE_RUN_REASONS.Running,
          cells: previous?.cells ?? [],
          scheduled: cells,
          processed: 0,
          cancelled: [...cancelledCells],
          pending: cells.filter((cell) => !cancelledCells.includes(cell)),
        }
        receivedProgress = true
        observed.current = snapshot
        setResult(snapshot)
        if (snapshot.reason === NEEDLE_RUN_REASONS.Stopped) {
          setExecution((value) => (value ? { ...value, settled: true } : value))
          controller.abort()
          setControls(null)
        }
        return true
      },
    })
    setError(null)
    setCheckpointError(false)
    setHistorical(false)
    if (!previous) setResult(null)
    observed.current = previous
    let secrets: string[] = []
    let resolvedRequest: VerificationToolRequestParams | null = null
    try {
      const request = await configuration.resolveRequest(controller.signal)
      controller.signal.throwIfAborted()
      if (!request) {
        setError(t("verifyDialog.tools.needle.errors.request"))
        return
      }
      secrets = request.secrets
      resolvedRequest = request
      const scope = await getNeedleScopeKey(request)
      if (!current()) return
      controller.signal.throwIfAborted()
      if (previous && scope !== resultScope.current)
        throw new Error("The connection changed; start a new needle test")
      resultScope.current = scope
      const finished = await (configuration.runner ?? defaultRunner)(
        {
          ...request,
          seed,
          cancelledCells: [...cancelledCells],
          selection,
          resumeFrom: previous ?? undefined,
          approvedPlan,
          approvedCounter: previous?.counter ?? counter!,
          abortSignal: controller.signal,
          onControls: (value) => {
            if (!current() || controller.signal.aborted) return
            remoteControls = value
            for (const scope of queuedSelections)
              void value.stopSelection(scope).catch(() => {
                if (current()) setStopError(scope)
              })
          },
          onProgress: (progress) => {
            if (current() && !controller.signal.aborted) {
              if (progress.reason !== NEEDLE_RUN_REASONS.Running) {
                setExecution((value) =>
                  value ? { ...value, settled: true } : value,
                )
                setControls(null)
              }
              receivedProgress = true
              observed.current = progress
              setResult(progress)
            }
          },
        },
        configuration.historyTarget ?? undefined,
      )
      if (current()) {
        observed.current = finished
        resumable.current = finished
        setResult(finished)
      }
    } catch (failure) {
      if (current()) {
        if (controller.signal.aborted) {
          if (observed.current)
            setResult({
              ...observed.current,
              reason: NEEDLE_RUN_REASONS.Stopped,
            })
        } else {
          if (observed.current?.reason === NEEDLE_RUN_REASONS.Running)
            setResult({
              ...observed.current,
              reason: NEEDLE_RUN_REASONS.Error,
              inFlight: undefined,
              pending: undefined,
            })
          const name = failure instanceof Error ? failure.name : "Error"
          const checkpoint =
            name === CONTEXT_CHECKPOINT_LIMIT_ERROR_NAME ||
            name === LONG_CONTEXT_ERROR_NAMES.NeedleCheckpoint
          setCheckpointError(checkpoint)
          setError(
            checkpoint
              ? t("verifyDialog.tools.context.discardWarning")
              : name === LONG_CONTEXT_ERROR_NAMES.Busy
                ? t("verifyDialog.tools.needle.errors.busy")
                : t("verifyDialog.tools.needle.errors.failed", {
                    detail: toSanitizedErrorSummary(failure, secrets),
                  }),
          )
        }
        if (resolvedRequest) {
          try {
            const saved = await (
              configuration.historyAccess ?? needleHistory
            ).get(resolvedRequest, configuration.historyTarget ?? undefined)
            const scope = await getNeedleScopeKey(resolvedRequest)
            if (current()) {
              resumable.current = saved?.result ?? null
              resultScope.current = saved ? scope : null
              setHistoryError(false)
              if (!receivedProgress && saved) {
                setResult(saved.result)
                setHistorical(true)
              }
            }
          } catch {
            if (current()) setHistoryError(true)
          }
        }
      }
    } finally {
      if (current()) {
        active.current = null
        setRunning(false)
        setControls(null)
        setStopError(null)
        setExecution(null)
      }
    }
  }
  return {
    counter,
    reference: counter
      ? getNeedleInputReference({ counter, capacity: options.capacity })
      : null,
    plan: planning.plan,
    matrixPlan: result
      ? expandNeedlePlan(result.plan)
      : planning.plan
        ? expandNeedlePlan(planning.plan)
        : null,
    invalid: planning.invalid,
    result,
    historical,
    running,
    execution,
    error,
    checkpointError,
    historyError,
    canRun,
    limitDraft,
    setLimitDraft,
    seedDraft,
    setSeedDraft,
    quick,
    setQuick,
    run: () => run(),
    runSelection: (selection: NeedleSelection) => run(selection),
    stop: () => {
      active.current?.abort()
      setControls(null)
      setStopError(null)
    },
    stopSelection: controls
      ? async (selection: NeedleSelection) => {
          const version = generation.current
          setStopError(null)
          try {
            await controls.stopSelection(selection)
          } catch {
            if (version === generation.current) setStopError(selection)
          }
        }
      : undefined,
    stopError,
    retry: () => setReload((value) => value + 1),
    clearHistory: () => {
      generation.current += 1
      active.current?.abort()
      active.current = null
      setRunning(false)
      setControls(null)
      setStopError(null)
      setExecution(null)
      setResult(null)
      resumable.current = null
      resultScope.current = null
      setHistorical(false)
    },
    discard:
      checkpointError && options.discardCheckpoints
        ? async () => {
            try {
              await options.discardCheckpoints?.()
              setError(null)
              setCheckpointError(false)
            } catch (failure) {
              setError(
                t("verifyDialog.tools.needle.errors.failed", {
                  detail: toSanitizedErrorSummary(failure, []),
                }),
              )
            }
          }
        : undefined,
  }
}

export type NeedleController = ReturnType<typeof useNeedleTest>
