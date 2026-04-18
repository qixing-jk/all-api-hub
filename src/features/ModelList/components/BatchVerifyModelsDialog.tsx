import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import type { HTMLAttributes, Key } from "react"
import { useTranslation } from "react-i18next"
import { Virtuoso } from "react-virtuoso"

import { formatLatency } from "~/components/dialogs/VerifyApiDialog/utils"
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Heading5,
  Modal,
  SearchableSelect,
} from "~/components/ui"
import {
  MODEL_LIST_BATCH_VERIFY_API_TYPE_MODES,
  MODEL_LIST_BATCH_VERIFY_CONCURRENCY,
  pickBatchVerifyCompatibleToken,
  resolveBatchVerifyApiType,
  type BatchVerifyApiTypeMode,
  type BatchVerifyModelItem,
} from "~/features/ModelList/batchVerification"
import { MODEL_MANAGEMENT_SOURCE_KINDS } from "~/features/ModelList/modelManagementSources"
import { cn } from "~/lib/utils"
import {
  fetchDisplayAccountTokens,
  resolveDisplayAccountTokenForSecret,
} from "~/services/accounts/utils/apiServiceRequest"
import {
  API_TYPES,
  getApiVerificationProbeDefinitions,
  runApiVerificationProbe,
  type ApiVerificationApiType,
  type ApiVerificationProbeId,
  type ApiVerificationProbeResult,
} from "~/services/verification/aiApiVerification"
import {
  getApiVerificationApiTypeLabel,
  getApiVerificationProbeLabel,
} from "~/services/verification/aiApiVerification/i18n"
import { toSanitizedErrorSummary } from "~/services/verification/aiApiVerification/utils"
import {
  createAccountModelVerificationHistoryTarget,
  createProfileModelVerificationHistoryTarget,
  createVerificationHistorySummary,
  verificationResultHistoryStorage,
} from "~/services/verification/verificationResultHistory"
import type { ApiToken } from "~/types"
import { createLogger } from "~/utils/core/logger"

const BATCH_VERIFY_ROW_STATUSES = {
  PENDING: "pending",
  RUNNING: "running",
  PASS: "pass",
  FAIL: "fail",
  SKIPPED: "skipped",
} as const

type BatchVerifyRowStatus =
  (typeof BATCH_VERIFY_ROW_STATUSES)[keyof typeof BATCH_VERIFY_ROW_STATUSES]

type BatchVerifyRow = {
  item: BatchVerifyModelItem
  status: BatchVerifyRowStatus
  latencyMs: number
  summary: string
  results: ApiVerificationProbeResult[]
  tokenName?: string
}

type AccountBatchVerifyModelItem = BatchVerifyModelItem & {
  source: Extract<
    BatchVerifyModelItem["source"],
    { kind: typeof MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT }
  >
}

type BatchVerifyModelsDialogProps = {
  isOpen: boolean
  onClose: () => void
  items: BatchVerifyModelItem[]
}

const logger = createLogger("BatchVerifyModelsDialog")

/** Normalize optional secrets before passing them to shared redaction. */
function filterRedactions(values: Array<string | undefined>): string[] {
  return values.filter(Boolean) as string[]
}

/** Build the initial row state for the current batch item snapshot. */
function buildRows(items: BatchVerifyModelItem[]): BatchVerifyRow[] {
  return items.map((item) => ({
    item,
    status: BATCH_VERIFY_ROW_STATUSES.PENDING,
    latencyMs: 0,
    summary: "",
    results: [],
  }))
}

/** Resolve the initial API type mode from the first profile-backed item. */
function getDefaultApiTypeMode(
  items: BatchVerifyModelItem[],
): BatchVerifyApiTypeMode {
  const profileItem = items.find(
    (
      item,
    ): item is BatchVerifyModelItem & {
      source: Extract<
        BatchVerifyModelItem["source"],
        { kind: typeof MODEL_MANAGEMENT_SOURCE_KINDS.PROFILE }
      >
    } => item.source.kind === MODEL_MANAGEMENT_SOURCE_KINDS.PROFILE,
  )
  return (
    profileItem?.source.profile.apiType ??
    MODEL_LIST_BATCH_VERIFY_API_TYPE_MODES.AUTO
  )
}

/** Narrow a batch row to account-backed sources before token lookup. */
function isAccountBatchVerifyModelItem(
  item: BatchVerifyModelItem,
): item is AccountBatchVerifyModelItem {
  return item.source.kind === MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT
}

/** Check whether a row status is terminal for progress accounting. */
function isCompletedStatus(status: BatchVerifyRowStatus) {
  return (
    status === BATCH_VERIFY_ROW_STATUSES.PASS ||
    status === BATCH_VERIFY_ROW_STATUSES.FAIL ||
    status === BATCH_VERIFY_ROW_STATUSES.SKIPPED
  )
}

/** Collapse probe results into the row status shown in the batch table. */
export function deriveBatchVerifyRowStatus(
  results: ApiVerificationProbeResult[],
): BatchVerifyRowStatus {
  if (results.length === 0) return BATCH_VERIFY_ROW_STATUSES.SKIPPED
  if (results.some((result) => result.status === "fail")) {
    return BATCH_VERIFY_ROW_STATUSES.FAIL
  }
  if (results.some((result) => result.status === "pass")) {
    return BATCH_VERIFY_ROW_STATUSES.PASS
  }
  return BATCH_VERIFY_ROW_STATUSES.SKIPPED
}

/** Extract stable identifiers for failure logs without exposing secrets. */
export function getBatchVerifyFailureLogIds(item: BatchVerifyModelItem) {
  return {
    accountId:
      item.source.kind === MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT
        ? item.source.account.id
        : undefined,
    profileId:
      item.source.kind === MODEL_MANAGEMENT_SOURCE_KINDS.PROFILE
        ? item.source.profile.id
        : undefined,
  }
}

/** Sum the latencies reported by all completed probes for a row. */
function getRowLatency(results: ApiVerificationProbeResult[]) {
  return results.reduce((total, result) => total + (result.latencyMs || 0), 0)
}

/** Pick a valid probe id for synthetic failure records. */
function getFirstApplicableProbeId(
  apiType: ApiVerificationApiType,
  selectedProbeIds: ApiVerificationProbeId[],
): ApiVerificationProbeId {
  const probeDefinitions = getApiVerificationProbeDefinitions(apiType)
  const availableProbeIds = new Set(probeDefinitions.map((probe) => probe.id))
  return (
    selectedProbeIds.find((probeId) => availableProbeIds.has(probeId)) ??
    probeDefinitions[0]?.id ??
    "text-generation"
  )
}

const DEFAULT_SELECTED_PROBE_IDS: ApiVerificationProbeId[] = ["text-generation"]

const BatchVerifyRowsList = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(function BatchVerifyRowsList({ children, className, ...props }, ref) {
  return (
    <div ref={ref} className={cn(className)} {...props}>
      {children}
    </div>
  )
})

const BatchVerifyRowsItem = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(function BatchVerifyRowsItem({ children, className, ...props }, ref) {
  return (
    <div ref={ref} className={cn(className)} {...props}>
      <div className="mx-2 my-2">{children}</div>
    </div>
  )
})

/**
 * Dialog for running a New API-style batch model availability test over the
 * currently filtered model list snapshot.
 */
export function BatchVerifyModelsDialog({
  isOpen,
  onClose,
  items,
}: BatchVerifyModelsDialogProps) {
  const { t } = useTranslation(["modelList", "aiApiVerification"])
  const [rows, setRows] = useState<BatchVerifyRow[]>(() => buildRows(items))
  const [apiTypeMode, setApiTypeMode] = useState<BatchVerifyApiTypeMode>(() =>
    getDefaultApiTypeMode(items),
  )
  const [selectedProbeIds, setSelectedProbeIds] = useState<
    ApiVerificationProbeId[]
  >(DEFAULT_SELECTED_PROBE_IDS)
  const [selectedModelKeys, setSelectedModelKeys] = useState<string[]>(() =>
    items.map((item) => item.key),
  )
  const [isRunning, setIsRunning] = useState(false)
  const [hasStarted, setHasStarted] = useState(false)
  const shouldStopRef = useRef(false)
  const batchAbortControllerRef = useRef<AbortController | null>(null)
  const previousDialogSnapshotRef = useRef({
    isOpen: false,
    items,
  })
  const tokenCacheRef = useRef(new Map<string, Promise<ApiToken[]>>())
  const resolvedTokenCacheRef = useRef(new Map<string, Promise<ApiToken>>())
  const clearCachedTokenPromises = useCallback(() => {
    tokenCacheRef.current.clear()
    resolvedTokenCacheRef.current.clear()
  }, [])

  useEffect(() => {
    const previousSnapshot = previousDialogSnapshotRef.current

    if (!isOpen) {
      previousDialogSnapshotRef.current = { isOpen, items }
      return
    }

    const opened = !previousSnapshot.isOpen
    const itemsChanged = previousSnapshot.items !== items
    if (!opened && !itemsChanged) return
    if (isRunning) return

    previousDialogSnapshotRef.current = { isOpen, items }
    shouldStopRef.current = false
    clearCachedTokenPromises()
    setRows(buildRows(items))
    setApiTypeMode(getDefaultApiTypeMode(items))
    setSelectedProbeIds(DEFAULT_SELECTED_PROBE_IDS)
    setSelectedModelKeys(items.map((item) => item.key))
    setIsRunning(false)
    setHasStarted(false)
  }, [clearCachedTokenPromises, isOpen, isRunning, items])

  const summary = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc.total += 1
        if (row.status === BATCH_VERIFY_ROW_STATUSES.PASS) acc.pass += 1
        if (row.status === BATCH_VERIFY_ROW_STATUSES.FAIL) acc.fail += 1
        if (row.status === BATCH_VERIFY_ROW_STATUSES.SKIPPED) acc.skipped += 1
        if (row.status === BATCH_VERIFY_ROW_STATUSES.RUNNING) acc.running += 1
        if (row.status === BATCH_VERIFY_ROW_STATUSES.PENDING) acc.pending += 1
        if (isCompletedStatus(row.status)) acc.completed += 1
        return acc
      },
      {
        total: 0,
        completed: 0,
        pass: 0,
        fail: 0,
        skipped: 0,
        running: 0,
        pending: 0,
      },
    )
  }, [rows])

  const apiTypeOptions = useMemo(
    () => [
      {
        value: MODEL_LIST_BATCH_VERIFY_API_TYPE_MODES.AUTO,
        label: t("modelList:batchVerify.apiType.auto"),
      },
      {
        value: API_TYPES.OPENAI_COMPATIBLE,
        label: getApiVerificationApiTypeLabel(t, API_TYPES.OPENAI_COMPATIBLE),
      },
      {
        value: API_TYPES.OPENAI,
        label: getApiVerificationApiTypeLabel(t, API_TYPES.OPENAI),
      },
      {
        value: API_TYPES.ANTHROPIC,
        label: getApiVerificationApiTypeLabel(t, API_TYPES.ANTHROPIC),
      },
      {
        value: API_TYPES.GOOGLE,
        label: getApiVerificationApiTypeLabel(t, API_TYPES.GOOGLE),
      },
    ],
    [t],
  )

  const probeOptions = useMemo(() => {
    const seenProbeIds = new Set<ApiVerificationProbeId>()
    return Object.values(API_TYPES).flatMap((apiType) =>
      getApiVerificationProbeDefinitions(apiType).flatMap((probe) => {
        if (seenProbeIds.has(probe.id)) return []
        seenProbeIds.add(probe.id)
        return [
          {
            id: probe.id,
            label: getApiVerificationProbeLabel(t, probe.id),
          },
        ]
      }),
    )
  }, [t])

  const canClose = !isRunning
  const selectedModelKeySet = useMemo(
    () => new Set(selectedModelKeys),
    [selectedModelKeys],
  )
  const canStart = selectedModelKeys.length > 0 && selectedProbeIds.length > 0
  const areAllModelsSelected =
    items.length > 0 && selectedModelKeys.length === items.length

  const updateRow = useCallback(
    (key: string, patch: Partial<Omit<BatchVerifyRow, "item">>) => {
      setRows((currentRows) =>
        currentRows.map((row) =>
          row.item.key === key ? { ...row, ...patch } : row,
        ),
      )
    },
    [],
  )

  const toggleProbe = useCallback((probeId: ApiVerificationProbeId) => {
    setSelectedProbeIds((currentProbeIds) =>
      currentProbeIds.includes(probeId)
        ? currentProbeIds.filter((currentProbeId) => currentProbeId !== probeId)
        : [...currentProbeIds, probeId],
    )
  }, [])

  const toggleModel = useCallback((modelKey: string) => {
    setSelectedModelKeys((currentModelKeys) =>
      currentModelKeys.includes(modelKey)
        ? currentModelKeys.filter(
            (currentModelKey) => currentModelKey !== modelKey,
          )
        : [...currentModelKeys, modelKey],
    )
  }, [])

  const selectAllModels = useCallback(() => {
    setSelectedModelKeys(items.map((item) => item.key))
  }, [items])

  const clearSelectedModels = useCallback(() => {
    setSelectedModelKeys([])
  }, [])

  const getAccountTokens = useCallback(
    (item: AccountBatchVerifyModelItem): Promise<ApiToken[]> => {
      const account = item.source.account
      const cached = tokenCacheRef.current.get(account.id)
      if (cached) return cached

      const promise = fetchDisplayAccountTokens(account)
      tokenCacheRef.current.set(account.id, promise)
      return promise
    },
    [],
  )

  const getResolvedToken = useCallback(
    (item: AccountBatchVerifyModelItem, token: ApiToken): Promise<ApiToken> => {
      const cacheKey = `${item.source.account.id}:${token.id}`
      const cached = resolvedTokenCacheRef.current.get(cacheKey)
      if (cached) return cached

      const promise = resolveDisplayAccountTokenForSecret(
        item.source.account,
        token,
      )
      resolvedTokenCacheRef.current.set(cacheKey, promise)
      return promise
    },
    [],
  )

  const persistResult = useCallback(
    async (
      item: BatchVerifyModelItem,
      apiType: ApiVerificationApiType,
      results: ApiVerificationProbeResult[],
    ) => {
      const target =
        item.source.kind === MODEL_MANAGEMENT_SOURCE_KINDS.PROFILE
          ? createProfileModelVerificationHistoryTarget(
              item.source.profile.id,
              item.modelId,
            )
          : createAccountModelVerificationHistoryTarget(
              item.source.account.id,
              item.modelId,
            )
      if (!target) return

      const historySummary = createVerificationHistorySummary({
        target,
        apiType,
        preferredModelId: item.modelId,
        results,
      })
      if (!historySummary) return

      await verificationResultHistoryStorage.upsertLatestSummary(historySummary)
    },
    [],
  )

  const runOne = useCallback(
    async (item: BatchVerifyModelItem, abortSignal: AbortSignal) => {
      const isStopped = () => shouldStopRef.current || abortSignal.aborted
      if (isStopped()) return

      const startedAt = Date.now()
      updateRow(item.key, {
        status: BATCH_VERIFY_ROW_STATUSES.RUNNING,
        latencyMs: 0,
        summary: t("modelList:batchVerify.status.running"),
        results: [],
        tokenName: undefined,
      })

      let apiKey = ""
      const apiType = resolveBatchVerifyApiType(apiTypeMode, item.modelId)
      const selectedProbeIdSet = new Set(selectedProbeIds)

      try {
        const credentials =
          item.source.kind === MODEL_MANAGEMENT_SOURCE_KINDS.PROFILE
            ? {
                baseUrl: item.source.profile.baseUrl,
                apiKey: item.source.profile.apiKey,
                tokenName: undefined,
              }
            : await (async () => {
                if (!isAccountBatchVerifyModelItem(item)) return null
                const account = item.source.account
                const tokens = await getAccountTokens(item)
                if (isStopped()) return null

                const token = pickBatchVerifyCompatibleToken(tokens, item)
                if (!token) {
                  const summary = t(
                    "modelList:batchVerify.messages.noCompatibleToken",
                  )
                  updateRow(item.key, {
                    status: BATCH_VERIFY_ROW_STATUSES.SKIPPED,
                    latencyMs: 0,
                    summary,
                    results: [],
                  })
                  return null
                }

                const resolvedToken = await getResolvedToken(item, token)
                if (isStopped()) return null

                return {
                  baseUrl: account.baseUrl,
                  apiKey: resolvedToken.key,
                  tokenName: token.name,
                  token: resolvedToken,
                }
              })()

        if (!credentials || isStopped()) return

        apiKey = credentials.apiKey
        const probesToRun = getApiVerificationProbeDefinitions(apiType).filter(
          (probe) =>
            selectedProbeIdSet.has(probe.id) &&
            (!probe.requiresModelId || item.modelId.trim()),
        )

        if (probesToRun.length === 0) {
          updateRow(item.key, {
            status: BATCH_VERIFY_ROW_STATUSES.SKIPPED,
            latencyMs: 0,
            summary: t("modelList:batchVerify.messages.noApplicableProbes"),
            results: [],
            tokenName: credentials.tokenName,
          })
          return
        }

        const tokenMeta =
          "token" in credentials && credentials.token
            ? {
                id: credentials.token.id,
                name: credentials.token.name,
                model_limits: credentials.token.model_limits,
                models: credentials.token.models,
              }
            : undefined

        const results: ApiVerificationProbeResult[] = []
        let stoppedBeforeCompletingProbes = false
        for (const probe of probesToRun) {
          if (isStopped()) {
            stoppedBeforeCompletingProbes = true
            break
          }

          try {
            const result = await runApiVerificationProbe({
              baseUrl: credentials.baseUrl,
              apiKey: credentials.apiKey,
              apiType,
              modelId: item.modelId,
              tokenMeta,
              probeId: probe.id,
              abortSignal,
            })
            if (isStopped()) {
              stoppedBeforeCompletingProbes = true
              break
            }
            results.push(result)
          } catch (error) {
            if (isStopped()) {
              stoppedBeforeCompletingProbes = true
              break
            }

            const redactions =
              item.source.kind === MODEL_MANAGEMENT_SOURCE_KINDS.PROFILE
                ? filterRedactions([
                    item.source.profile.apiKey,
                    item.source.profile.baseUrl,
                  ])
                : filterRedactions([
                    item.source.account.token,
                    item.source.account.cookieAuthSessionCookie,
                    apiKey,
                  ])

            results.push({
              id: probe.id,
              status: "fail",
              latencyMs: 0,
              summary:
                toSanitizedErrorSummary(error, redactions) ||
                t("modelList:batchVerify.messages.unexpected"),
            })
          }
        }

        if (stoppedBeforeCompletingProbes || isStopped()) return

        await persistResult(item, apiType, results).catch((persistError) => {
          logger.error("Failed to persist batch verification result", {
            modelId: item.modelId,
            message: toSanitizedErrorSummary(persistError, [apiKey]),
          })
        })

        const pass = results.filter((result) => result.status === "pass").length
        const fail = results.filter((result) => result.status === "fail").length
        const unsupported = results.filter(
          (result) => result.status === "unsupported",
        ).length

        updateRow(item.key, {
          status: deriveBatchVerifyRowStatus(results),
          latencyMs: getRowLatency(results),
          summary: t("modelList:batchVerify.messages.probeSummary", {
            count: results.length,
            pass,
            fail,
            unsupported,
          }),
          results,
          tokenName: credentials.tokenName,
        })
      } catch (error) {
        if (isStopped()) return

        const redactions =
          item.source.kind === MODEL_MANAGEMENT_SOURCE_KINDS.PROFILE
            ? filterRedactions([
                item.source.profile.apiKey,
                item.source.profile.baseUrl,
              ])
            : filterRedactions([
                item.source.account.token,
                item.source.account.cookieAuthSessionCookie,
                apiKey,
              ])
        const message =
          toSanitizedErrorSummary(error, redactions) ||
          t("modelList:batchVerify.messages.unexpected")

        logger.error("Batch model verification failed", {
          ...getBatchVerifyFailureLogIds(item),
          modelId: item.modelId,
          message,
        })

        const result: ApiVerificationProbeResult = {
          id: getFirstApplicableProbeId(apiType, selectedProbeIds),
          status: BATCH_VERIFY_ROW_STATUSES.FAIL,
          latencyMs: Date.now() - startedAt,
          summary: message,
        }
        await persistResult(item, apiType, [result]).catch((persistError) => {
          logger.error("Failed to persist batch verification failure", {
            modelId: item.modelId,
            message: toSanitizedErrorSummary(persistError, redactions),
          })
        })
        updateRow(item.key, {
          status: BATCH_VERIFY_ROW_STATUSES.FAIL,
          latencyMs: result.latencyMs,
          summary: message,
          results: [result],
        })
      }
    },
    [
      apiTypeMode,
      getAccountTokens,
      getResolvedToken,
      persistResult,
      selectedProbeIds,
      t,
      updateRow,
    ],
  )

  const markUnfinishedRowsStopped = useCallback(() => {
    setRows((currentRows) =>
      currentRows.map((row) =>
        row.status === BATCH_VERIFY_ROW_STATUSES.PENDING ||
        row.status === BATCH_VERIFY_ROW_STATUSES.RUNNING
          ? {
              ...row,
              status: BATCH_VERIFY_ROW_STATUSES.SKIPPED,
              summary: t("modelList:batchVerify.messages.stopped"),
              results: [],
            }
          : row,
      ),
    )
  }, [t])

  const runBatch = async () => {
    if (isRunning || !canStart) return

    const selectedItems = items.filter((item) =>
      selectedModelKeySet.has(item.key),
    )
    shouldStopRef.current = false
    clearCachedTokenPromises()
    const abortController = new AbortController()
    batchAbortControllerRef.current = abortController
    setHasStarted(true)
    setIsRunning(true)
    setRows(
      buildRows(items).map((row) =>
        selectedModelKeySet.has(row.item.key)
          ? row
          : {
              ...row,
              status: BATCH_VERIFY_ROW_STATUSES.SKIPPED,
              summary: t("modelList:batchVerify.messages.notSelected"),
            },
      ),
    )

    let nextIndex = 0
    const workerCount = Math.min(
      MODEL_LIST_BATCH_VERIFY_CONCURRENCY,
      selectedItems.length,
    )

    const worker = async () => {
      while (!shouldStopRef.current) {
        const index = nextIndex
        nextIndex += 1
        const item = selectedItems[index]
        if (!item) return
        await runOne(item, abortController.signal)
      }
    }

    try {
      await Promise.all(
        Array.from({ length: workerCount }, async () => {
          await worker()
        }),
      )
    } finally {
      if (shouldStopRef.current) {
        markUnfinishedRowsStopped()
      }
      if (batchAbortControllerRef.current === abortController) {
        batchAbortControllerRef.current = null
      }
      setIsRunning(false)
    }
  }

  const stopBatch = () => {
    shouldStopRef.current = true
    batchAbortControllerRef.current?.abort()
  }

  const statusVariant = (status: BatchVerifyRowStatus) => {
    if (status === BATCH_VERIFY_ROW_STATUSES.PASS) return "success"
    if (status === BATCH_VERIFY_ROW_STATUSES.FAIL) return "danger"
    if (status === BATCH_VERIFY_ROW_STATUSES.SKIPPED) return "warning"
    if (status === BATCH_VERIFY_ROW_STATUSES.RUNNING) return "info"
    return "outline"
  }

  const renderRow = (row: BatchVerifyRow, key?: Key) => (
    <div
      key={key}
      data-testid={`batch-verify-row-${row.item.key}`}
      className="dark:border-dark-bg-tertiary rounded-md border border-gray-100 p-3"
    >
      <div className="flex items-start justify-between gap-3">
        <Checkbox
          checked={selectedModelKeySet.has(row.item.key)}
          onCheckedChange={() => toggleModel(row.item.key)}
          disabled={isRunning}
          aria-label={t("modelList:batchVerify.modelSelection.toggle", {
            model: row.item.modelId,
          })}
          data-testid={`batch-verify-model-checkbox-${row.item.key}`}
          className="mt-0.5"
        />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <div className="dark:text-dark-text-primary min-w-0 truncate text-sm font-medium text-gray-900">
              {row.item.modelId}
            </div>
            <Badge variant={statusVariant(row.status)} size="sm">
              {row.status === BATCH_VERIFY_ROW_STATUSES.PASS
                ? t("modelList:batchVerify.status.pass")
                : row.status === BATCH_VERIFY_ROW_STATUSES.FAIL
                  ? t("modelList:batchVerify.status.fail")
                  : row.status === BATCH_VERIFY_ROW_STATUSES.SKIPPED
                    ? t("modelList:batchVerify.status.skipped")
                    : row.status === BATCH_VERIFY_ROW_STATUSES.RUNNING
                      ? t("modelList:batchVerify.status.running")
                      : t("modelList:batchVerify.status.pending")}
            </Badge>
            <span className="dark:text-dark-text-tertiary text-xs text-gray-500">
              {formatLatency(row.latencyMs)}
            </span>
          </div>
          <div className="dark:text-dark-text-secondary mt-1 text-xs text-gray-600">
            {row.summary || t("modelList:batchVerify.messages.pending")}
          </div>
          {row.tokenName ? (
            <div className="dark:text-dark-text-tertiary mt-1 text-xs text-gray-500">
              {t("modelList:batchVerify.tokenUsed", {
                name: row.tokenName,
              })}
            </div>
          ) : null}
          {row.results.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {row.results.map((result) => (
                <Badge
                  key={result.id}
                  variant={statusVariant(
                    result.status === "unsupported"
                      ? BATCH_VERIFY_ROW_STATUSES.SKIPPED
                      : result.status,
                  )}
                  size="sm"
                >
                  {getApiVerificationProbeLabel(t, result.id)}
                  {" · "}
                  {result.status === "pass"
                    ? t("modelList:batchVerify.status.pass")
                    : result.status === "fail"
                      ? t("modelList:batchVerify.status.fail")
                      : t("aiApiVerification:verifyDialog.status.unsupported")}
                  {" · "}
                  {formatLatency(result.latencyMs)}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )

  const header = (
    <div className="min-w-0">
      <Heading5 className="truncate">
        {t("modelList:batchVerify.title")}
      </Heading5>
      <div className="dark:text-dark-text-tertiary mt-1 truncate text-xs text-gray-500">
        {t("modelList:batchVerify.subtitle", { count: items.length })}
      </div>
    </div>
  )

  const footer = (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="dark:text-dark-text-tertiary text-xs text-gray-500">
        {hasStarted
          ? t("modelList:batchVerify.summary", {
              ...summary,
              count: summary.total,
            })
          : t("modelList:batchVerify.idleHint")}
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={!canClose}>
          {t("aiApiVerification:verifyDialog.actions.close")}
        </Button>
        {isRunning ? (
          <Button variant="destructive" onClick={stopBatch}>
            {t("modelList:batchVerify.actions.stop")}
          </Button>
        ) : (
          <Button onClick={runBatch} disabled={!canStart}>
            {hasStarted
              ? t("modelList:batchVerify.actions.rerun")
              : t("modelList:batchVerify.actions.start")}
          </Button>
        )}
      </div>
    </div>
  )

  return (
    <Modal
      isOpen={isOpen}
      onClose={canClose ? onClose : () => {}}
      header={header}
      footer={footer}
      size="lg"
      closeOnEsc={canClose}
      closeOnBackdropClick={canClose}
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <div className="dark:text-dark-text-tertiary text-xs text-gray-500">
              {t("modelList:batchVerify.apiType.label")}
            </div>
            <SearchableSelect
              options={apiTypeOptions}
              value={apiTypeMode}
              onChange={(value) =>
                setApiTypeMode(value as BatchVerifyApiTypeMode)
              }
              disabled={isRunning}
            />
          </div>

          <div className="flex flex-wrap items-end gap-2 sm:justify-end">
            <Badge variant="info">
              {t("modelList:batchVerify.counts.total", {
                value: summary.total,
              })}
            </Badge>
            <Badge variant="success">
              {t("modelList:batchVerify.counts.pass", {
                value: summary.pass,
              })}
            </Badge>
            <Badge variant="danger">
              {t("modelList:batchVerify.counts.fail", {
                value: summary.fail,
              })}
            </Badge>
            <Badge variant="warning">
              {t("modelList:batchVerify.counts.skipped", {
                value: summary.skipped,
              })}
            </Badge>
          </div>
        </div>

        <div className="space-y-2">
          <div className="dark:text-dark-text-tertiary text-xs text-gray-500">
            {t("modelList:batchVerify.probes.label")}
          </div>
          <div className="flex flex-wrap gap-2">
            {probeOptions.map((probe) => (
              <label
                key={probe.id}
                className="dark:border-dark-bg-tertiary flex cursor-pointer items-center gap-2 rounded-md border border-gray-100 px-2 py-1.5 text-xs"
              >
                <Checkbox
                  checked={selectedProbeIds.includes(probe.id)}
                  onCheckedChange={() => toggleProbe(probe.id)}
                  disabled={isRunning}
                />
                <span>{probe.label}</span>
              </label>
            ))}
          </div>
          {selectedProbeIds.length === 0 ? (
            <div className="text-xs text-red-500">
              {t("modelList:batchVerify.probes.noneSelected")}
            </div>
          ) : null}
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="dark:text-dark-text-tertiary text-xs text-gray-500">
              {t("modelList:batchVerify.modelSelection.label")}
            </div>
            <div className="flex items-center gap-2">
              <span className="dark:text-dark-text-tertiary text-xs text-gray-500">
                {t("modelList:batchVerify.modelSelection.selectedSummary", {
                  count: selectedModelKeys.length,
                  selected: selectedModelKeys.length,
                  total: items.length,
                })}
              </span>
              <Button
                size="sm"
                variant="secondary"
                onClick={
                  areAllModelsSelected ? clearSelectedModels : selectAllModels
                }
                disabled={isRunning || items.length === 0}
              >
                {areAllModelsSelected
                  ? t("modelList:batchVerify.modelSelection.clearAll")
                  : t("modelList:batchVerify.modelSelection.selectAll")}
              </Button>
            </div>
          </div>
          {selectedModelKeys.length === 0 ? (
            <div className="text-xs text-red-500">
              {t("modelList:batchVerify.modelSelection.noneSelected")}
            </div>
          ) : null}
        </div>

        <Alert variant="warning">
          <p>{t("modelList:batchVerify.warning")}</p>
        </Alert>

        <Virtuoso
          className="dark:border-dark-bg-tertiary overflow-x-hidden rounded-md border border-gray-100"
          data={rows}
          computeItemKey={(_, row) => row.item.key}
          components={{
            Item: BatchVerifyRowsItem,
            List: BatchVerifyRowsList,
          }}
          style={{ height: "50vh" }}
          itemContent={(_, row) => renderRow(row)}
        />
      </div>
    </Modal>
  )
}
