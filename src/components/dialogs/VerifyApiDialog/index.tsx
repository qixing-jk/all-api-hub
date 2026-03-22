import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { ProbeStatusBadge } from "~/components/dialogs/VerifyApiDialog/ProbeStatusBadge"
import { VerificationStatusBadge } from "~/components/dialogs/VerifyApiDialog/VerificationStatusBadge"
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
  createVerificationHistorySummary,
  verificationResultHistoryStorage,
  type ApiVerificationHistorySummary,
} from "~/services/verification/verificationResultHistory"
import type { ApiToken } from "~/types"
import { formatLocaleDateTime } from "~/utils/core/formatters"
import { createLogger } from "~/utils/core/logger"

import type { ProbeItemState, VerifyApiDialogProps } from "./types"
import { formatLatency, safeJsonStringify } from "./utils"

/**
 * Unified logger scoped to the API verification dialog.
 */
const logger = createLogger("VerifyApiDialog")

/**
 * Build the probe list state for the selected API type.
 * The list is shown immediately so users can run/retry individual items.
 */
function buildProbeState(
  nextApiType: ApiVerificationApiType,
  persistedSummary?: ApiVerificationHistorySummary | null,
): ProbeItemState[] {
  const defs = getApiVerificationProbeDefinitions(nextApiType)
  const persistedById = new Map(
    (persistedSummary?.probes ?? []).map((probe) => [probe.id, probe]),
  )

  return defs.map((definition): ProbeItemState => {
    const persistedProbe = persistedById.get(definition.id)
    return {
      definition,
      isRunning: false,
      attempts: 0,
      result: persistedProbe
        ? {
            id: persistedProbe.id,
            status: persistedProbe.status,
            latencyMs: persistedProbe.latencyMs,
            summary: persistedProbe.summary,
            summaryKey: persistedProbe.summaryKey,
            summaryParams: persistedProbe.summaryParams,
          }
        : null,
    }
  })
}

/**
 *
 */
function extractProbeResults(probes: ProbeItemState[]) {
  return probes.flatMap((probe) => (probe.result ? [probe.result] : []))
}

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
  const [probes, setProbes] = useState<ProbeItemState[]>([])
  const [persistedSummary, setPersistedSummary] =
    useState<ApiVerificationHistorySummary | null>(null)

  const probesRef = useRef<ProbeItemState[]>([])
  const persistedSummaryRef = useRef<ApiVerificationHistorySummary | null>(null)
  const historyTarget = useMemo(() => {
    const trimmedModelId = initialModelId?.trim()
    return trimmedModelId
      ? createAccountModelVerificationHistoryTarget(account.id, trimmedModelId)
      : null
  }, [account.id, initialModelId])

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

  const replaceProbes = (next: ProbeItemState[]) => {
    probesRef.current = next
    setProbes(next)
  }

  const applyPersistedSummary = (
    next: ApiVerificationHistorySummary | null,
  ) => {
    persistedSummaryRef.current = next
    setPersistedSummary(next)
  }

  const persistCurrentResults = async (
    nextApiType: ApiVerificationApiType,
    nextProbes: ProbeItemState[],
    preferredModelId?: string,
  ) => {
    if (!historyTarget) return

    const nextSummary = createVerificationHistorySummary({
      target: historyTarget,
      apiType: nextApiType,
      results: extractProbeResults(nextProbes),
      preferredModelId,
    })
    if (!nextSummary) return

    const persisted =
      await verificationResultHistoryStorage.upsertLatestSummary(nextSummary)
    applyPersistedSummary(persisted)
  }

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
    if (!selectedToken) return
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

    setIsRunning(true)
    replaceProbes(buildProbeState(apiType))
    try {
      // Run sequentially so each probe updates independently (and can be retried individually).
      const ordered = getApiVerificationProbeDefinitions(apiType)
      for (const probe of ordered) {
        if (probe.requiresModelId && !modelId.trim() && !tokenModelHint)
          continue

        await runProbe(probe.id)
      }
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

    if (historyTarget) {
      void verificationResultHistoryStorage
        .getLatestSummary(historyTarget)
        .then((summary) => {
          if (cancelled) return
          applyPersistedSummary(summary)
          replaceProbes(buildProbeState(initialApiType, summary))
          if (summary?.resolvedModelId) {
            setModelId(
              (current) => current.trim() || summary.resolvedModelId || "",
            )
          }
        })
        .catch(() => {
          if (cancelled) return
          applyPersistedSummary(null)
          replaceProbes(buildProbeState(initialApiType))
        })
    }

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
    )
  }, [apiType, isOpen])

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
            <span className="dark:text-dark-text-tertiary text-gray-500">
              {t("verifyDialog.history.lastVerified")}
            </span>
            <VerificationStatusBadge
              status={persistedSummary?.status ?? "unverified"}
            />
            <span className="dark:text-dark-text-secondary text-gray-600">
              {persistedSummary
                ? formatLocaleDateTime(persistedSummary.verifiedAt)
                : t("verifyDialog.history.unverified")}
            </span>
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
