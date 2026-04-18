import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

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

import {
  MODEL_LIST_BATCH_VERIFY_CONCURRENCY,
  pickBatchVerifyCompatibleToken,
  resolveBatchVerifyApiType,
  type BatchVerifyApiTypeMode,
  type BatchVerifyModelItem,
} from "../batchVerification"

type BatchVerifyRowStatus = "pending" | "running" | "pass" | "fail" | "skipped"

type BatchVerifyRow = {
  item: BatchVerifyModelItem
  status: BatchVerifyRowStatus
  latencyMs: number
  summary: string
  results: ApiVerificationProbeResult[]
  tokenName?: string
}

type AccountBatchVerifyModelItem = BatchVerifyModelItem & {
  source: Extract<BatchVerifyModelItem["source"], { kind: "account" }>
}

type BatchVerifyModelsDialogProps = {
  isOpen: boolean
  onClose: () => void
  items: BatchVerifyModelItem[]
}

const logger = createLogger("BatchVerifyModelsDialog")

/** Build the initial row state for the current batch item snapshot. */
function buildRows(items: BatchVerifyModelItem[]): BatchVerifyRow[] {
  return items.map((item) => ({
    item,
    status: "pending",
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
      source: Extract<BatchVerifyModelItem["source"], { kind: "profile" }>
    } => item.source.kind === "profile",
  )
  return profileItem?.source.profile.apiType ?? "auto"
}

/** Narrow a batch row to account-backed sources before token lookup. */
function isAccountBatchVerifyModelItem(
  item: BatchVerifyModelItem,
): item is AccountBatchVerifyModelItem {
  return item.source.kind === "account"
}

/** Check whether a row status is terminal for progress accounting. */
function isCompletedStatus(status: BatchVerifyRowStatus) {
  return status === "pass" || status === "fail" || status === "skipped"
}

/** Collapse probe results into the row status shown in the batch table. */
function deriveRowStatus(
  results: ApiVerificationProbeResult[],
): BatchVerifyRowStatus {
  if (results.length === 0) return "skipped"
  if (results.some((result) => result.status === "fail")) return "fail"
  if (results.some((result) => result.status === "pass")) return "pass"
  return "skipped"
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
  const tokenCacheRef = useRef(new Map<string, Promise<ApiToken[]>>())
  const resolvedTokenCacheRef = useRef(new Map<string, Promise<ApiToken>>())
  const clearCachedTokenPromises = useCallback(() => {
    tokenCacheRef.current.clear()
    resolvedTokenCacheRef.current.clear()
  }, [])

  useEffect(() => {
    if (!isOpen) return

    shouldStopRef.current = false
    clearCachedTokenPromises()
    setRows(buildRows(items))
    setApiTypeMode(getDefaultApiTypeMode(items))
    setSelectedProbeIds(DEFAULT_SELECTED_PROBE_IDS)
    setSelectedModelKeys(items.map((item) => item.key))
    setIsRunning(false)
    setHasStarted(false)
  }, [clearCachedTokenPromises, isOpen, items])

  const summary = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc.total += 1
        if (row.status === "pass") acc.pass += 1
        if (row.status === "fail") acc.fail += 1
        if (row.status === "skipped") acc.skipped += 1
        if (row.status === "running") acc.running += 1
        if (row.status === "pending") acc.pending += 1
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
        value: "auto",
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
        item.source.kind === "profile"
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
    async (item: BatchVerifyModelItem) => {
      const startedAt = Date.now()
      updateRow(item.key, {
        status: "running",
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
          item.source.kind === "profile"
            ? {
                baseUrl: item.source.profile.baseUrl,
                apiKey: item.source.profile.apiKey,
                tokenName: undefined,
              }
            : await (async () => {
                if (!isAccountBatchVerifyModelItem(item)) return null
                const account = item.source.account
                const tokens = await getAccountTokens(item)
                const token = pickBatchVerifyCompatibleToken(tokens, item)
                if (!token) {
                  const summary = t(
                    "modelList:batchVerify.messages.noCompatibleToken",
                  )
                  updateRow(item.key, {
                    status: "skipped",
                    latencyMs: 0,
                    summary,
                    results: [],
                  })
                  return null
                }

                const resolvedToken = await getResolvedToken(item, token)
                return {
                  baseUrl: account.baseUrl,
                  apiKey: resolvedToken.key,
                  tokenName: token.name,
                  token: resolvedToken,
                }
              })()

        if (!credentials) return

        apiKey = credentials.apiKey
        const probesToRun = getApiVerificationProbeDefinitions(apiType).filter(
          (probe) =>
            selectedProbeIdSet.has(probe.id) &&
            (!probe.requiresModelId || item.modelId.trim()),
        )

        if (probesToRun.length === 0) {
          updateRow(item.key, {
            status: "skipped",
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
        for (const probe of probesToRun) {
          try {
            const result = await runApiVerificationProbe({
              baseUrl: credentials.baseUrl,
              apiKey: credentials.apiKey,
              apiType,
              modelId: item.modelId,
              tokenMeta,
              probeId: probe.id,
            })
            results.push(result)
          } catch (error) {
            const redactions =
              item.source.kind === "profile"
                ? [item.source.profile.apiKey, item.source.profile.baseUrl]
                : [
                    item.source.account.token,
                    item.source.account.cookieAuthSessionCookie,
                    apiKey,
                  ].filter(Boolean)

            results.push({
              id: probe.id,
              status: "fail",
              latencyMs: 0,
              summary:
                toSanitizedErrorSummary(error, redactions as string[]) ||
                t("modelList:batchVerify.messages.unexpected"),
            })
          }
        }

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
          status: deriveRowStatus(results),
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
        const redactions =
          item.source.kind === "profile"
            ? [item.source.profile.apiKey, item.source.profile.baseUrl]
            : [
                item.source.account.token,
                item.source.account.cookieAuthSessionCookie,
                apiKey,
              ].filter(Boolean)
        const message =
          toSanitizedErrorSummary(error, redactions as string[]) ||
          t("modelList:batchVerify.messages.unexpected")

        logger.error("Batch model verification failed", {
          accountId:
            item.source.kind === "account" ? item.source.account.id : undefined,
          profileId:
            item.source.kind === "profile" ? item.source.profile.id : undefined,
          modelId: item.modelId,
          message,
        })

        const result: ApiVerificationProbeResult = {
          id: getFirstApplicableProbeId(apiType, selectedProbeIds),
          status: "fail",
          latencyMs: Date.now() - startedAt,
          summary: message,
        }
        await persistResult(item, apiType, [result]).catch((persistError) => {
          logger.error("Failed to persist batch verification failure", {
            modelId: item.modelId,
            message: toSanitizedErrorSummary(
              persistError,
              redactions as string[],
            ),
          })
        })
        updateRow(item.key, {
          status: "fail",
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

  const markPendingRowsStopped = useCallback(() => {
    setRows((currentRows) =>
      currentRows.map((row) =>
        row.status === "pending"
          ? {
              ...row,
              status: "skipped",
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
    setHasStarted(true)
    setIsRunning(true)
    setRows(
      buildRows(items).map((row) =>
        selectedModelKeySet.has(row.item.key)
          ? row
          : {
              ...row,
              status: "skipped",
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
        await runOne(item)
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
        markPendingRowsStopped()
      }
      setIsRunning(false)
    }
  }

  const stopBatch = () => {
    shouldStopRef.current = true
  }

  const statusVariant = (status: BatchVerifyRowStatus) => {
    if (status === "pass") return "success"
    if (status === "fail") return "danger"
    if (status === "skipped") return "warning"
    if (status === "running") return "info"
    return "outline"
  }

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

        <div className="dark:border-dark-bg-tertiary max-h-[50vh] space-y-2 overflow-y-auto rounded-md border border-gray-100 p-2">
          {rows.map((row) => (
            <div
              key={row.item.key}
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
                      {row.status === "pass"
                        ? t("modelList:batchVerify.status.pass")
                        : row.status === "fail"
                          ? t("modelList:batchVerify.status.fail")
                          : row.status === "skipped"
                            ? t("modelList:batchVerify.status.skipped")
                            : row.status === "running"
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
                              ? "skipped"
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
                              : t(
                                  "aiApiVerification:verifyDialog.status.unsupported",
                                )}
                          {" · "}
                          {formatLatency(result.latencyMs)}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  )
}
