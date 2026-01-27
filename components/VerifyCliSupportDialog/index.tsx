import { useCallback, useEffect, useMemo, useState } from "react"
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
import { guessModelIdFromToken } from "~/services/aiApiVerification"
import {
  inferHttpStatus,
  summaryKeyFromHttpStatus,
  toSanitizedErrorSummary,
} from "~/services/aiApiVerification/utils"
import { getApiService } from "~/services/apiService"
import {
  CLI_TOOL_IDS,
  runCliSupportTool,
} from "~/services/cliSupportVerification"
import type { CliSupportResult } from "~/services/cliSupportVerification"
import type { ApiToken } from "~/types"
import { createLogger } from "~/utils/logger"

import { ToolStatusBadge } from "./ToolStatusBadge"
import type { ToolItemState, VerifyCliSupportDialogProps } from "./types"
import { formatLatency, safeJsonStringify } from "./utils"

/**
 * Unified logger scoped to the CLI support verification dialog.
 */
const logger = createLogger("VerifyCliSupportDialog")

/**
 * Build the initial UI state for all tool rows.
 */
function buildInitialToolState(): ToolItemState[] {
  return CLI_TOOL_IDS.map((toolId) => ({
    toolId,
    isRunning: false,
    attempts: 0,
    result: null,
  }))
}

/**
 * Modal dialog that runs CLI support simulation for a selected account token.
 *
 * Each CLI tool implies a fixed API family and endpoint style, so users do not need
 * to pick an API type manually.
 */
export function VerifyCliSupportDialog(props: VerifyCliSupportDialogProps) {
  const { isOpen, onClose, account, initialModelId } = props
  const { t } = useTranslation("cliSupportVerification")

  const [modelId, setModelId] = useState<string>(initialModelId?.trim() ?? "")
  const [isRunning, setIsRunning] = useState(false)
  const [isLoadingTokens, setIsLoadingTokens] = useState(false)
  const [tokens, setTokens] = useState<ApiToken[]>([])
  const [selectedTokenId, setSelectedTokenId] = useState<string>("")
  const [tools, setTools] = useState<ToolItemState[]>([])

  const selectedToken = tokens.find(
    (tok) => tok.id.toString() === selectedTokenId,
  )

  const tokenModelHint = useMemo(() => {
    if (!selectedToken) return ""
    return (
      guessModelIdFromToken({
        models: selectedToken.models,
        model_limits: selectedToken.model_limits,
      }) ?? ""
    )
  }, [selectedToken])

  const resolvedModelId = (modelId.trim() || tokenModelHint.trim() || "").trim()

  const isAnyToolRunning = tools.some((t) => t.isRunning)
  const canClose = !isRunning && !isAnyToolRunning

  const hasAnyResult = tools.some((t) => t.result !== null)

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

  const loadTokens = useCallback(async () => {
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
  }, [
    account.authType,
    account.baseUrl,
    account.cookieAuthSessionCookie,
    account.id,
    account.siteType,
    account.token,
    account.userId,
  ])

  const runTool = async (
    toolId: (typeof CLI_TOOL_IDS)[number],
  ): Promise<CliSupportResult | null> => {
    if (!selectedToken) return null

    if (!resolvedModelId.trim()) return null

    const startedAt = Date.now()
    setTools((prev) =>
      prev.map((t) =>
        t.toolId === toolId
          ? { ...t, isRunning: true, attempts: t.attempts + 1 }
          : t,
      ),
    )

    try {
      const result = await runCliSupportTool({
        toolId,
        baseUrl: account.baseUrl,
        apiKey: selectedToken.key,
        modelId: resolvedModelId,
      })

      setTools((prev) =>
        prev.map((t) =>
          t.toolId === toolId ? { ...t, isRunning: false, result } : t,
        ),
      )
      return result
    } catch (error) {
      const finishedAt = Date.now()
      const sanitizedMessage = toSanitizedErrorSummary(error, [
        selectedToken.key,
      ])
      const inferredStatus = inferHttpStatus(error, sanitizedMessage)
      const summaryKey =
        summaryKeyFromHttpStatus(inferredStatus) ??
        (typeof inferredStatus === "number"
          ? "verifyDialog.summaries.httpError"
          : "verifyDialog.summaries.unexpectedError")
      const summaryParams =
        summaryKey === "verifyDialog.summaries.httpError"
          ? { status: inferredStatus }
          : summaryKey === "verifyDialog.summaries.unexpectedError"
            ? { message: sanitizedMessage }
            : undefined

      logger.error("Tool run failed", {
        toolId,
        inferredStatus,
        message: sanitizedMessage,
      })
      setTools((prev) =>
        prev.map((t) => {
          if (t.toolId !== toolId) return t

          // Ensure failures are rendered distinctly from "Not run yet" (result=null).
          const failureResult: CliSupportResult = {
            id: toolId,
            probeId: "tool-calling",
            status: "fail",
            latencyMs: Math.max(0, finishedAt - startedAt),
            summary: sanitizedMessage || "Unknown error",
            summaryKey,
            summaryParams,
            input: {
              toolId,
              baseUrl: account.baseUrl,
              modelId: resolvedModelId,
              tokenId: selectedTokenId,
            },
            output: {
              error: sanitizedMessage,
              inferredHttpStatus: inferredStatus,
            },
            details: {
              occurredAt: new Date(finishedAt).toISOString(),
              attempts: t.attempts,
            },
          }

          return { ...t, isRunning: false, result: failureResult }
        }),
      )
      return null
    }
  }

  const runAll = async () => {
    if (!selectedTokenId || !selectedToken) return
    setIsRunning(true)
    setTools(buildInitialToolState())

    // Run sequentially so each tool updates independently (and can be retried individually).
    for (const toolId of CLI_TOOL_IDS) {
      await runTool(toolId)
    }

    setIsRunning(false)
  }

  useEffect(() => {
    if (!isOpen) return
    setTools(buildInitialToolState())
    void loadTokens()
    setModelId(initialModelId?.trim() ?? "")
  }, [initialModelId, isOpen, loadTokens])

  const canRunAll = !!selectedToken && resolvedModelId.trim().length > 0

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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
              {t("verifyDialog.meta.model")}
            </div>
            <Input
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              placeholder={t("verifyDialog.meta.modelPlaceholder")}
              disabled={isRunning}
            />
            {tokenModelHint && !modelId.trim() && (
              <div className="dark:text-dark-text-tertiary text-xs text-gray-500">
                {t("verifyDialog.modelHint", {
                  modelId: tokenModelHint,
                })}
              </div>
            )}
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
          {tools.map((tool) => {
            const result = tool.result
            const isDisabledForModel = !resolvedModelId.trim()

            const resultSummary = isDisabledForModel
              ? t("verifyDialog.requiresModelId")
              : result?.summaryKey
                ? t(result.summaryKey, result.summaryParams)
                : result
                  ? result.summary
                  : t("verifyDialog.notRunYet")

            return (
              <div
                key={tool.toolId}
                data-testid={`verify-cli-${tool.toolId}`}
                className="dark:border-dark-bg-tertiary rounded-md border border-gray-100 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      <div className="dark:text-dark-text-primary min-w-0 truncate text-sm font-medium text-gray-900">
                        {t(`verifyDialog.tools.${tool.toolId}`)}
                      </div>

                      <div className="flex items-center gap-2">
                        {result ? (
                          <ToolStatusBadge result={result} />
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
                    onClick={() => runTool(tool.toolId)}
                    disabled={
                      isRunning ||
                      isLoadingTokens ||
                      tool.isRunning ||
                      !selectedToken ||
                      isDisabledForModel
                    }
                  >
                    {tool.isRunning
                      ? t("verifyDialog.actions.running")
                      : tool.attempts > 0
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
