import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { formatLatency } from "~/components/dialogs/VerifyApiDialog/utils"
import {
  Alert,
  Badge,
  Button,
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
  runApiVerificationProbe,
  type ApiVerificationApiType,
  type ApiVerificationProbeResult,
} from "~/services/verification/aiApiVerification"
import { getApiVerificationApiTypeLabel } from "~/services/verification/aiApiVerification/i18n"
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
  tokenName?: string
}

type BatchVerifyModelsDialogProps = {
  isOpen: boolean
  onClose: () => void
  items: BatchVerifyModelItem[]
}

const logger = createLogger("BatchVerifyModelsDialog")

/**
 *
 */
function buildRows(items: BatchVerifyModelItem[]): BatchVerifyRow[] {
  return items.map((item) => ({
    item,
    status: "pending",
    latencyMs: 0,
    summary: "",
  }))
}

/**
 *
 */
function getDefaultApiTypeMode(
  items: BatchVerifyModelItem[],
): BatchVerifyApiTypeMode {
  const profileItem = items.find((item) => item.source.kind === "profile")
  return profileItem?.source.kind === "profile"
    ? profileItem.source.profile.apiType
    : "auto"
}

/**
 *
 */
function isCompletedStatus(status: BatchVerifyRowStatus) {
  return status === "pass" || status === "fail" || status === "skipped"
}

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
  const [isRunning, setIsRunning] = useState(false)
  const [hasStarted, setHasStarted] = useState(false)
  const shouldStopRef = useRef(false)
  const tokenCacheRef = useRef(new Map<string, Promise<ApiToken[]>>())
  const resolvedTokenCacheRef = useRef(new Map<string, Promise<ApiToken>>())

  useEffect(() => {
    if (!isOpen) return

    shouldStopRef.current = false
    tokenCacheRef.current.clear()
    resolvedTokenCacheRef.current.clear()
    setRows(buildRows(items))
    setApiTypeMode(getDefaultApiTypeMode(items))
    setIsRunning(false)
    setHasStarted(false)
  }, [isOpen, items])

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

  const canClose = !isRunning

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

  const getAccountTokens = useCallback(
    (item: BatchVerifyModelItem): Promise<ApiToken[]> => {
      if (item.source.kind !== "account") {
        return Promise.resolve([])
      }

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
    (item: BatchVerifyModelItem, token: ApiToken): Promise<ApiToken> => {
      if (item.source.kind !== "account") {
        return Promise.resolve(token)
      }

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
      result: ApiVerificationProbeResult,
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
        results: [result],
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
        tokenName: undefined,
      })

      let apiKey = ""
      const apiType = resolveBatchVerifyApiType(apiTypeMode, item.modelId)

      try {
        const credentials =
          item.source.kind === "profile"
            ? {
                baseUrl: item.source.profile.baseUrl,
                apiKey: item.source.profile.apiKey,
                tokenName: undefined,
              }
            : await (async () => {
                if (item.source.kind !== "account") return null
                const account = item.source.account
                const tokens = await getAccountTokens(item)
                const token = pickBatchVerifyCompatibleToken(tokens, item)
                if (!token) {
                  const result: ApiVerificationProbeResult = {
                    id: "text-generation",
                    status: "fail",
                    latencyMs: 0,
                    summary: t(
                      "modelList:batchVerify.messages.noCompatibleToken",
                    ),
                  }
                  await persistResult(item, apiType, result).catch(
                    (persistError) => {
                      logger.error(
                        "Failed to persist skipped batch verification result",
                        {
                          modelId: item.modelId,
                          message: toSanitizedErrorSummary(persistError, []),
                        },
                      )
                    },
                  )
                  updateRow(item.key, {
                    status: "skipped",
                    latencyMs: 0,
                    summary: result.summary,
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
        const result = await runApiVerificationProbe({
          baseUrl: credentials.baseUrl,
          apiKey: credentials.apiKey,
          apiType,
          modelId: item.modelId,
          tokenMeta:
            "token" in credentials && credentials.token
              ? {
                  id: credentials.token.id,
                  name: credentials.token.name,
                  model_limits: credentials.token.model_limits,
                  models: credentials.token.models,
                }
              : undefined,
          probeId: "text-generation",
        })

        await persistResult(item, apiType, result).catch((persistError) => {
          logger.error("Failed to persist batch verification result", {
            modelId: item.modelId,
            message: toSanitizedErrorSummary(persistError, [apiKey]),
          })
        })

        updateRow(item.key, {
          status: result.status === "pass" ? "pass" : "fail",
          latencyMs: result.latencyMs,
          summary: result.summary,
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
          id: "text-generation",
          status: "fail",
          latencyMs: Date.now() - startedAt,
          summary: message,
        }
        await persistResult(item, apiType, result).catch((persistError) => {
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
        })
      }
    },
    [
      apiTypeMode,
      getAccountTokens,
      getResolvedToken,
      persistResult,
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
            }
          : row,
      ),
    )
  }, [t])

  const runBatch = async () => {
    if (isRunning || rows.length === 0) return

    shouldStopRef.current = false
    setHasStarted(true)
    setIsRunning(true)
    setRows(buildRows(items))

    let nextIndex = 0
    const workerCount = Math.min(
      MODEL_LIST_BATCH_VERIFY_CONCURRENCY,
      items.length,
    )

    const worker = async () => {
      while (!shouldStopRef.current) {
        const index = nextIndex
        nextIndex += 1
        const item = items[index]
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
        {t("modelList:batchVerify.subtitle", { value: items.length })}
      </div>
    </div>
  )

  const footer = (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="dark:text-dark-text-tertiary text-xs text-gray-500">
        {hasStarted
          ? t("modelList:batchVerify.summary", summary)
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
          <Button onClick={runBatch} disabled={items.length === 0}>
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

          <div className="dark:border-dark-bg-tertiary rounded-md border border-gray-100 p-3 text-sm">
            <div className="flex flex-wrap gap-2">
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
        </div>

        <Alert variant="warning">
          <p>{t("modelList:batchVerify.warning")}</p>
        </Alert>

        <div className="dark:border-dark-bg-tertiary max-h-[52vh] space-y-2 overflow-y-auto rounded-md border border-gray-100 p-2">
          {rows.map((row) => (
            <div
              key={row.item.key}
              data-testid={`batch-verify-row-${row.item.key}`}
              className="dark:border-dark-bg-tertiary rounded-md border border-gray-100 p-3"
            >
              <div className="flex items-start justify-between gap-3">
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
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  )
}
