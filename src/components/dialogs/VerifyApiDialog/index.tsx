import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { ProbeStatusBadge } from "~/components/dialogs/VerifyApiDialog/ProbeStatusBadge"
import { VerificationHistorySummary } from "~/components/dialogs/VerifyApiDialog/VerificationHistorySummary"
import {
  Alert,
  Badge,
  Button,
  CollapsibleSection,
  Heading5,
  Input,
  SearchableSelect,
} from "~/components/ui"
import { Modal } from "~/components/ui/Dialog/Modal"
import { resolveDisplayAccountTokenForSecret } from "~/services/accounts/utils/apiServiceRequest"
import { getApiService } from "~/services/apiService"
import { identifyProvider } from "~/services/models/utils/modelProviders"
import { startProductAnalyticsAction } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/events"
import {
  API_TYPES,
  getApiVerificationProbeDefinitions,
  guessModelIdFromToken,
  runApiVerificationProbe,
} from "~/services/verification/aiApiVerification"
import type {
  ApiVerificationApiType,
  ApiVerificationProbeId,
  ApiVerificationProbeResult,
} from "~/services/verification/aiApiVerification"
import {
  getApiVerificationApiTypeLabel,
  getApiVerificationProbeLabel,
  translateApiVerificationSummary,
} from "~/services/verification/aiApiVerification/i18n"
import { toSanitizedErrorSummary } from "~/services/verification/aiApiVerification/utils"
import {
  createAccountModelVerificationHistoryTarget,
  verificationResultHistoryStorage,
} from "~/services/verification/verificationResultHistory"
import type { ApiToken } from "~/types"
import { createLogger } from "~/utils/core/logger"

import { buildProbeState } from "./probeState"
import type { VerifyApiDialogProps } from "./types"
import { useVerificationDialogState } from "./useVerificationDialogState"
import { formatLatency, safeJsonStringify } from "./utils"

/**
 * Unified logger scoped to the API verification dialog.
 */
const logger = createLogger("VerifyApiDialog")

/**
 * Modal dialog that runs API verification for a selected account token + model.
 */
export function VerifyApiDialog(props: VerifyApiDialogProps) {
  const { isOpen, onClose, account, initialModelId } = props
  const { t } = useTranslation("aiApiVerification")

  const [isRunning, setIsRunning] = useState(false)
  const [isLoadingTokens, setIsLoadingTokens] = useState(false)
  const [tokens, setTokens] = useState<ApiToken[]>([])
  const [selectedTokenId, setSelectedTokenId] = useState<string>("")
  const [apiType, setApiType] = useState<ApiVerificationApiType>(
    API_TYPES.OPENAI_COMPATIBLE,
  )
  const [modelId, setModelId] = useState<string>(initialModelId?.trim() ?? "")
  const historyTarget = useMemo(() => {
    const trimmedModelId = initialModelId?.trim()
    return trimmedModelId
      ? createAccountModelVerificationHistoryTarget(account.id, trimmedModelId)
      : null
  }, [account.id, initialModelId])
  const {
    probes,
    setProbes: replaceProbes,
    probesRef,
    persistedSummary,
    setPersistedSummary: applyPersistedSummary,
    persistedSummaryRef,
    persistCurrentResults,
    loadVerificationHistory,
  } = useVerificationDialogState(historyTarget)

  const selectedToken = tokens.find(
    (tok) => tok.id.toString() === selectedTokenId,
  )

  const tokenModelHint = useMemo(() => {
    if (!selectedToken) return undefined
    return guessModelIdFromToken({
      models: selectedToken.models,
      model_limits: selectedToken.model_limits,
    })
  }, [selectedToken])

  const isAnyProbeRunning = probes.some((p) => p.isRunning)
  const canClose = !isRunning && !isAnyProbeRunning

  const hasAnyResult = probes.some((p) => p.result !== null)
  const analyticsContext = {
    featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ModelList,
    actionId: PRODUCT_ANALYTICS_ACTION_IDS.VerifyModelApi,
    surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsModelListRowActions,
    entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
  } as const

  const header = useMemo(() => {
    return (
      <div className="min-w-0">
        <Heading5 className="truncate">{t("verifyDialog.title")}</Heading5>
        <div className="dark:text-dark-text-tertiary mt-1 truncate text-xs text-gray-500">
          {account.baseUrl} · {account.name}
        </div>
      </div>
    )
  }, [account.baseUrl, account.name, t])

  const loadTokens = async () => {
    setIsLoadingTokens(true)
    try {
      const accountTokens = await getApiService(
        account.siteType,
      ).fetchAccountTokens({
        baseUrl: account.baseUrl,
        accountId: account.id,
        auth: {
          authType: account.authType,
          userId: account.userId,
          accessToken: account.token,
          cookie: account.cookieAuthSessionCookie,
        },
      })

      const sorted = [...accountTokens].sort((a, b) => {
        const aEnabled = a.status === 1 ? 0 : 1
        const bEnabled = b.status === 1 ? 0 : 1
        return aEnabled - bEnabled
      })

      setTokens(sorted)

      const defaultToken =
        sorted.find((tok) => tok.status === 1) ?? sorted.at(0) ?? null
      setSelectedTokenId(defaultToken ? defaultToken.id.toString() : "")
    } catch (error) {
      logger.error("Failed to load tokens", {
        message: toSanitizedErrorSummary(
          error,
          [account.token, account.cookieAuthSessionCookie].filter(
            Boolean,
          ) as string[],
        ),
      })
      setTokens([])
      setSelectedTokenId("")
    } finally {
      setIsLoadingTokens(false)
    }
  }

  const runProbe = async (probeId: ApiVerificationProbeId) => {
    if (!selectedToken) return null
    let resolvedToken = selectedToken

    const pendingProbes = probesRef.current.map((probe) =>
      probe.definition.id === probeId
        ? { ...probe, isRunning: true, attempts: probe.attempts + 1 }
        : probe,
    )
    replaceProbes(pendingProbes)

    try {
      resolvedToken = await resolveDisplayAccountTokenForSecret(
        account,
        selectedToken,
      )
      const result = await runApiVerificationProbe({
        baseUrl: account.baseUrl,
        apiKey: resolvedToken.key,
        apiType,
        modelId: modelId.trim() || undefined,
        tokenMeta: {
          id: resolvedToken.id,
          name: resolvedToken.name,
          model_limits: resolvedToken.model_limits,
          models: resolvedToken.models,
        },
        probeId,
      })

      const nextProbes = probesRef.current.map((probe) =>
        probe.definition.id === probeId
          ? { ...probe, isRunning: false, result }
          : probe,
      )
      replaceProbes(nextProbes)
      await persistCurrentResults(
        apiType,
        nextProbes,
        modelId.trim() || tokenModelHint || initialModelId?.trim(),
      )
      return result
    } catch (error) {
      logger.error("Probe failed", {
        probeId,
        message: toSanitizedErrorSummary(
          error,
          [
            selectedToken.key,
            resolvedToken.key,
            account.token,
            account.cookieAuthSessionCookie,
          ].filter(Boolean) as string[],
        ),
      })

      const fallback: ApiVerificationProbeResult = {
        id: probeId,
        status: "fail",
        latencyMs: 0,
        summary: t("verifyDialog.errors.unexpected"),
      }
      const nextProbes = probesRef.current.map((probe) => {
        if (probe.definition.id !== probeId) return probe
        return {
          ...probe,
          isRunning: false,
          // Surface a generic message to avoid leaking provider error details.
          result: fallback,
        }
      })
      replaceProbes(nextProbes)
      await persistCurrentResults(
        apiType,
        nextProbes,
        modelId.trim() || tokenModelHint || initialModelId?.trim(),
      )
      return fallback
    }
  }

  const clearHistory = async () => {
    if (!historyTarget) return
    await verificationResultHistoryStorage.clearTarget(historyTarget)
    applyPersistedSummary(null)
    replaceProbes(buildProbeState(apiType))
  }

  // The suite can always run the models probe without a model id.
  const canRunAll = !!selectedToken

  const runAll = async () => {
    if (!canRunAll) return

    const tracker = startProductAnalyticsAction(analyticsContext)
    let successCount = 0
    let failureCount = 0
    let hasExecutedProbe = false
    setIsRunning(true)
    replaceProbes(buildProbeState(apiType))
    try {
      // Run sequentially so each probe updates independently (and can be retried individually).
      const ordered = getApiVerificationProbeDefinitions(apiType)
      for (const probe of ordered) {
        if (probe.requiresModelId && !modelId.trim() && !tokenModelHint)
          continue

        const result = await runProbe(probe.id)
        if (!result) continue
        if (result.status === "pass") {
          hasExecutedProbe = true
          successCount += 1
        } else if (result.status === "fail") {
          hasExecutedProbe = true
          failureCount += 1
        }
      }
      const completionResult =
        failureCount > 0
          ? PRODUCT_ANALYTICS_RESULTS.Failure
          : hasExecutedProbe
            ? PRODUCT_ANALYTICS_RESULTS.Success
            : PRODUCT_ANALYTICS_RESULTS.Skipped
      await tracker.complete(completionResult, {
        insights: {
          successCount,
          failureCount,
        },
      })
    } catch (error) {
      logger.error("Model verification run failed", {
        message: toSanitizedErrorSummary(error, []),
      })
      await tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        insights: {
          successCount,
          failureCount,
        },
      })
    } finally {
      setIsRunning(false)
    }
  }

  useEffect(() => {
    if (!isOpen) return

    let cancelled = false
    const trimmedModelId = initialModelId?.trim() ?? ""
    setTokens([])
    setSelectedTokenId("")
    setModelId(trimmedModelId)
    applyPersistedSummary(null)

    const providerType = trimmedModelId
      ? identifyProvider(trimmedModelId)
      : null

    // Map detected provider to the closest verification API type.
    const initialApiType: ApiVerificationApiType =
      providerType === "Claude"
        ? API_TYPES.ANTHROPIC
        : providerType === "Gemini"
          ? API_TYPES.GOOGLE
          : API_TYPES.OPENAI_COMPATIBLE

    setApiType(initialApiType)
    replaceProbes(buildProbeState(initialApiType))

    void loadVerificationHistory({
      apiType: initialApiType,
      isCancelled: () => cancelled,
      onResolvedModelId: (resolvedModelId) => {
        setModelId((current) => current.trim() || resolvedModelId)
      },
    })

    void loadTokens()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.id, historyTarget, initialModelId, isOpen])

  useEffect(() => {
    if (!isOpen) return
    replaceProbes(
      buildProbeState(
        apiType,
        apiType === persistedSummaryRef.current?.apiType
          ? persistedSummaryRef.current
          : null,
      ),
      false,
    )
  }, [apiType, isOpen, persistedSummaryRef, replaceProbes])

  const footer = (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div>
        {historyTarget ? (
          <Button variant="outline" onClick={clearHistory} disabled={!canClose}>
            {t("verifyDialog.history.clear")}
          </Button>
        ) : null}
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={!canClose}>
          {t("verifyDialog.actions.close")}
        </Button>
        <Button
          variant="success"
          onClick={runAll}
          disabled={isRunning || isLoadingTokens || !canRunAll}
        >
          {isRunning
            ? t("verifyDialog.actions.running")
            : t("verifyDialog.actions.run")}
        </Button>
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
      <div className="space-y-3">
        {historyTarget ? (
          <div className="dark:border-dark-bg-tertiary flex flex-wrap items-center gap-2 rounded-md border border-gray-100 p-3 text-sm">
            <VerificationHistorySummary summary={persistedSummary} />
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <div className="dark:text-dark-text-tertiary text-xs text-gray-500">
              {t("verifyDialog.meta.token")}
            </div>
            <SearchableSelect
              options={[
                { value: "", label: t("verifyDialog.meta.tokenPlaceholder") },
                ...tokens.map((tok) => ({
                  value: tok.id.toString(),
                  label: tok.name,
                })),
              ]}
              value={selectedTokenId}
              onChange={setSelectedTokenId}
              disabled={isLoadingTokens}
              placeholder={t("verifyDialog.meta.tokenPlaceholder")}
            />
          </div>

          <div className="space-y-1.5">
            <div className="dark:text-dark-text-tertiary text-xs text-gray-500">
              {t("verifyDialog.meta.apiType")}
            </div>
            <SearchableSelect
              options={[
                // Keep a fixed display order for the supported API types.
                {
                  value: API_TYPES.OPENAI_COMPATIBLE,
                  label: getApiVerificationApiTypeLabel(
                    t,
                    API_TYPES.OPENAI_COMPATIBLE,
                  ),
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
              ]}
              value={apiType}
              onChange={(value) => setApiType(value as ApiVerificationApiType)}
              disabled={isRunning}
              placeholder={t("verifyDialog.meta.apiTypePlaceholder")}
            />
          </div>

          <div className="space-y-1.5">
            <div className="dark:text-dark-text-tertiary text-xs text-gray-500">
              {t("verifyDialog.meta.model")}
            </div>
            <Input
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              placeholder={t("verifyDialog.meta.modelPlaceholder")}
              disabled={isRunning}
            />
          </div>
        </div>

        {!hasAnyResult && (
          <div className="dark:text-dark-text-secondary text-sm text-gray-600">
            {isLoadingTokens
              ? t("verifyDialog.loadingTokensHint")
              : t("verifyDialog.idleHint")}
          </div>
        )}

        <Alert variant="warning">
          <p>{t("verifyDialog.warning")}</p>
        </Alert>

        <div className="space-y-2">
          {probes.map((probe) => {
            const result = probe.result
            const isDisabledForModel =
              probe.definition.requiresModelId &&
              !modelId.trim() &&
              !tokenModelHint

            const resultSummary = isDisabledForModel
              ? t("verifyDialog.requiresModelId")
              : result?.summaryKey
                ? translateApiVerificationSummary(
                    t,
                    result.summaryKey,
                    result.summaryParams,
                  ) ?? result.summary
                : result?.status === "unsupported"
                  ? t("verifyDialog.unsupportedProbeForApiType", {
                      probe: getApiVerificationProbeLabel(
                        t,
                        probe.definition.id,
                      ),
                    })
                  : result
                    ? result.summary
                    : t("verifyDialog.notRunYet")
            return (
              <div
                key={probe.definition.id}
                data-testid={`verify-probe-${probe.definition.id}`}
                className="dark:border-dark-bg-tertiary rounded-md border border-gray-100 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      <div className="dark:text-dark-text-primary min-w-0 truncate text-sm font-medium text-gray-900">
                        {getApiVerificationProbeLabel(t, probe.definition.id)}
                      </div>

                      <div className="flex items-center gap-2">
                        {result ? (
                          <ProbeStatusBadge result={result} />
                        ) : (
                          <Badge variant="outline" size="sm">
                            {t("verifyDialog.status.pending")}
                          </Badge>
                        )}
                        <div className="dark:text-dark-text-tertiary text-xs text-gray-500">
                          {result ? formatLatency(result.latencyMs) : "-"}
                        </div>
                      </div>
                    </div>

                    <div className="dark:text-dark-text-secondary mt-1 text-xs text-gray-600">
                      {resultSummary}
                    </div>
                  </div>

                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => runProbe(probe.definition.id)}
                    disabled={
                      isRunning ||
                      isLoadingTokens ||
                      probe.isRunning ||
                      !selectedToken ||
                      isDisabledForModel
                    }
                  >
                    {probe.isRunning
                      ? t("verifyDialog.actions.running")
                      : probe.attempts > 0
                        ? t("verifyDialog.actions.retry")
                        : t("verifyDialog.actions.runOne")}
                  </Button>
                </div>

                {result &&
                  (result.input !== undefined ||
                    result.output !== undefined) && (
                    <div className="mt-3 space-y-2">
                      {result.input !== undefined && (
                        <CollapsibleSection
                          title={t("verifyDialog.details.input")}
                        >
                          <pre className="dark:text-dark-text-secondary overflow-auto text-xs break-words whitespace-pre-wrap text-gray-700">
                            {safeJsonStringify(result.input)}
                          </pre>
                        </CollapsibleSection>
                      )}
                      {result.output !== undefined && (
                        <CollapsibleSection
                          title={t("verifyDialog.details.output")}
                        >
                          <pre className="dark:text-dark-text-secondary overflow-auto text-xs break-words whitespace-pre-wrap text-gray-700">
                            {safeJsonStringify(result.output)}
                          </pre>
                        </CollapsibleSection>
                      )}
                    </div>
                  )}
              </div>
            )
          })}
        </div>
      </div>
    </Modal>
  )
}
