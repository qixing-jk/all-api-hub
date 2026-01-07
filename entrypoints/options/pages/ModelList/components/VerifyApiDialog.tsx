import { CheckCircleIcon, XCircleIcon } from "@heroicons/react/24/outline"
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  Badge,
  Button,
  Heading5,
  Input,
  SearchableSelect,
} from "~/components/ui"
import { Modal } from "~/components/ui/Dialog/Modal"
import { getApiService } from "~/services/apiService"
import { runApiVerification } from "~/services/apiVerification/apiVerificationService"
import type { ApiVerificationProbeResult } from "~/services/apiVerification/types"
import type { ApiToken, DisplaySiteData } from "~/types"

type VerifyApiDialogProps = {
  isOpen: boolean
  onClose: () => void
  account: DisplaySiteData
  initialModelId?: string
}

/**
 * Format probe latency for display.
 */
function formatLatency(latencyMs: number) {
  if (!Number.isFinite(latencyMs) || latencyMs <= 0) return "-"
  return `${Math.round(latencyMs)}ms`
}

/**
 * Render a standardized status badge for a probe result.
 */
function ProbeStatusBadge({ result }: { result: ApiVerificationProbeResult }) {
  const { t } = useTranslation("modelList")

  if (result.status === "pass") {
    return (
      <Badge variant="success" size="sm">
        <span className="flex items-center gap-1">
          <CheckCircleIcon className="h-3.5 w-3.5" />
          {t("verifyDialog.status.pass")}
        </span>
      </Badge>
    )
  }

  if (result.status === "unsupported") {
    return (
      <Badge variant="outline" size="sm">
        {t("verifyDialog.status.unsupported")}
      </Badge>
    )
  }

  return (
    <Badge variant="destructive" size="sm">
      <span className="flex items-center gap-1">
        <XCircleIcon className="h-3.5 w-3.5" />
        {t("verifyDialog.status.fail")}
      </span>
    </Badge>
  )
}

/**
 * Modal dialog that runs API verification for a selected account token + model.
 */
export function VerifyApiDialog(props: VerifyApiDialogProps) {
  const { isOpen, onClose, account, initialModelId } = props
  const { t } = useTranslation("modelList")

  const [isRunning, setIsRunning] = useState(false)
  const [isLoadingTokens, setIsLoadingTokens] = useState(false)
  const [tokens, setTokens] = useState<ApiToken[]>([])
  const [selectedTokenId, setSelectedTokenId] = useState<string>("")
  const [modelId, setModelId] = useState<string>(initialModelId?.trim() ?? "")
  const [results, setResults] = useState<ApiVerificationProbeResult[] | null>(
    null,
  )

  const selectedToken = tokens.find(
    (tok) => tok.id.toString() === selectedTokenId,
  )

  const canClose = !isRunning

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
    } finally {
      setIsLoadingTokens(false)
    }
  }

  const run = async () => {
    if (!selectedToken || !modelId.trim()) return

    setIsRunning(true)
    setResults(null)
    try {
      const report = await runApiVerification({
        baseUrl: account.baseUrl,
        apiKey: selectedToken.key,
        modelId: modelId.trim(),
        tokenMeta: {
          id: selectedToken.id,
          name: selectedToken.name,
          model_limits: selectedToken.model_limits,
          models: selectedToken.models,
        },
      })

      setResults(report.results)
    } finally {
      setIsRunning(false)
    }
  }

  useEffect(() => {
    if (!isOpen) return
    setResults(null)
    setTokens([])
    setSelectedTokenId("")
    setModelId(initialModelId?.trim() ?? "")
    void loadTokens()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.id, initialModelId, isOpen])

  const footer = (
    <div className="flex justify-end gap-2">
      <Button variant="secondary" onClick={onClose} disabled={!canClose}>
        {t("verifyDialog.actions.close")}
      </Button>
      <Button
        variant="success"
        onClick={run}
        disabled={
          isRunning || isLoadingTokens || !selectedToken || !modelId.trim()
        }
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
          </div>
        </div>

        {results === null ? (
          <div className="dark:text-dark-text-secondary text-sm text-gray-600">
            {isLoadingTokens
              ? t("verifyDialog.loadingTokensHint")
              : t("verifyDialog.idleHint")}
          </div>
        ) : (
          <div className="space-y-2">
            {results.map((result) => (
              <div
                key={result.id}
                className="dark:border-dark-bg-tertiary rounded-md border border-gray-100 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="dark:text-dark-text-primary text-sm font-medium text-gray-900">
                      {t(`verifyDialog.probes.${result.id}`)}
                    </div>
                    <div className="dark:text-dark-text-secondary mt-1 text-xs text-gray-600">
                      {result.summary}
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <ProbeStatusBadge result={result} />
                    <div className="dark:text-dark-text-tertiary mt-1 text-xs text-gray-500">
                      {formatLatency(result.latencyMs)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}
