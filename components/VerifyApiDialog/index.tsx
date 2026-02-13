import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

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
import {
  API_TYPES,
  getApiVerificationProbeDefinitions,
  guessModelIdFromToken,
  runApiVerificationProbe,
} from "~/services/aiApiVerification"
import type {
  ApiVerificationApiType,
  ApiVerificationProbeId,
} from "~/services/aiApiVerification"
import { toSanitizedErrorSummary } from "~/services/aiApiVerification/utils"
import { getApiService } from "~/services/apiService"
import type { ApiToken } from "~/types"
import { createLogger } from "~/utils/logger"
import { identifyProvider } from "~/utils/modelProviders"

import { ProbeStatusBadge } from "./ProbeStatusBadge"
import type { ProbeItemState, VerifyApiDialogProps } from "./types"
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
  const [probes, setProbes] = useState<ProbeItemState[]>([])

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

  /**
   * Build the probe list state for the selected API type.
   * The list is shown immediately so users can run/retry individual items.
   */
  const buildProbeState = (nextApiType: ApiVerificationApiType) => {
    const defs = getApiVerificationProbeDefinitions(nextApiType)
    return defs.map(
      (definition): ProbeItemState => ({
        definition,
        isRunning: false,
        attempts: 0,
        result: null,
      }),
    )
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

    setProbes((prev) =>
      prev.map((p) =>
        p.definition.id === probeId
          ? { ...p, isRunning: true, attempts: p.attempts + 1 }
          : p,
      ),
    )

    try {
      const result = await runApiVerificationProbe({
        baseUrl: account.baseUrl,
        apiKey: selectedToken.key,
        apiType,
        modelId: modelId.trim() || undefined,
        tokenMeta: {
          id: selectedToken.id,
          name: selectedToken.name,
          model_limits: selectedToken.model_limits,
          models: selectedToken.models,
        },
        probeId,
      })

      setProbes((prev) =>
        prev.map((p) =>
          p.definition.id === probeId ? { ...p, isRunning: false, result } : p,
        ),
      )
    } catch (error) {
      logger.error("Probe failed", {
        probeId,
        message: toSanitizedErrorSummary(
          error,
          [
            selectedToken.key,
            account.token,
            account.cookieAuthSessionCookie,
          ].filter(Boolean) as string[],
        ),
      })
      setProbes((prev) =>
        prev.map((p) => {
          if (p.definition.id !== probeId) return p
          return {
            ...p,
            isRunning: false,
            // Surface a generic message to avoid leaking provider error details.
            result: {
              id: probeId,
              status: "fail",
              latencyMs: 0,
              summary: t("verifyDialog.errors.unexpected"),
            },
          }
        }),
      )
    }
  }

  // The suite can always run the models probe without a model id.
  const canRunAll = !!selectedToken

  const runAll = async () => {
    if (!canRunAll) return

    setIsRunning(true)
    setProbes((prev) =>
      prev.map((p) => ({ ...p, isRunning: false, attempts: 0, result: null })),
    )
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
    const trimmedModelId = initialModelId?.trim() ?? ""
    setTokens([])
    setSelectedTokenId("")
    setModelId(trimmedModelId)

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
    setProbes(buildProbeState(initialApiType))
    void loadTokens()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.id, initialModelId, isOpen])

  useEffect(() => {
    if (!isOpen) return
    setProbes(buildProbeState(apiType))
  }, [apiType, isOpen])

  const footer = (
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
                  label: t("verifyDialog.apiTypes.openaiCompatible"),
                },
                {
                  value: API_TYPES.OPENAI,
                  label: t("verifyDialog.apiTypes.openai"),
                },
                {
                  value: API_TYPES.ANTHROPIC,
                  label: t("verifyDialog.apiTypes.anthropic"),
                },
                {
                  value: API_TYPES.GOOGLE,
                  label: t("verifyDialog.apiTypes.google"),
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
                ? t(result.summaryKey, result.summaryParams)
                : result?.status === "unsupported"
                  ? t("verifyDialog.unsupportedProbeForApiType", {
                      probe: t(`verifyDialog.probes.${probe.definition.id}`),
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
                        {t(`verifyDialog.probes.${probe.definition.id}`)}
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
