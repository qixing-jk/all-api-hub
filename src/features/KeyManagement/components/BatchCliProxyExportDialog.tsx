import { Loader2 } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { CliProxyIcon } from "~/components/icons/CliProxyIcon"
import {
  Badge,
  Button,
  FormField,
  Input,
  Modal,
  ModelListInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui"
import {
  KEY_MANAGEMENT_ENTRY_KINDS,
  type CliProxyExportEntry,
} from "~/features/KeyManagement/types"
import { buildServiceCredentialEntryIdentityKey } from "~/features/KeyManagement/utils"
import { resolveExportTokenForSecret } from "~/services/accounts/utils/exportTokenSecret"
import {
  buildDefaultCliProxyProviderBaseUrl,
  CLI_PROXY_PROVIDER_TYPES,
  getCliProxyProviderTypeDescription,
  getCliProxyProviderTypeLabel,
  normalizeCliProxyProviderBaseUrl,
  type CliProxyModelMapping,
  type CliProxyProviderType,
} from "~/services/integrations/cliProxyProviderTypes"
import { importToCliProxy } from "~/services/integrations/cliProxyService"
import { startProductAnalyticsAction } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import type { ApiToken } from "~/types"
import { getErrorMessage } from "~/utils/core/error"
import { showResultToast } from "~/utils/core/toastHelpers"

import { buildTokenIdentityKey } from "../utils"

interface BatchCliProxyExportDialogProps {
  isOpen: boolean
  onClose: () => void
  items: CliProxyExportEntry[]
}

const EXECUTION_STATUSES = {
  Pending: "pending",
  Running: "running",
  Success: "success",
  Failed: "failed",
} as const

type ExecutionStatus =
  (typeof EXECUTION_STATUSES)[keyof typeof EXECUTION_STATUSES]

interface ExecutionState {
  status: ExecutionStatus
  message?: string
}

/**
 * Builds a CLIProxyAPI provider name from account metadata.
 */
function buildProviderName(item: CliProxyExportEntry) {
  if (item.kind === KEY_MANAGEMENT_ENTRY_KINDS.ServiceCredential) {
    return item.account.name || item.credential.label || item.account.baseUrl
  }

  return item.account.name || item.account.baseUrl
}

/**
 * Resolves the user-facing key label shown in the batch preview.
 */
function getEntryTokenName(item: CliProxyExportEntry) {
  return item.kind === KEY_MANAGEMENT_ENTRY_KINDS.ServiceCredential
    ? item.credential.label
    : item.token.name
}

/**
 * Selects the upstream API base URL for the exported provider.
 */
function getEntryBaseUrl(item: CliProxyExportEntry) {
  return item.kind === KEY_MANAGEMENT_ENTRY_KINDS.ServiceCredential
    ? item.credential.baseUrl || item.account.baseUrl
    : item.account.baseUrl
}

/**
 * Resolves a CLIProxy-compatible token object for each product entry kind.
 */
async function resolveCliProxyExportToken(
  item: CliProxyExportEntry,
): Promise<ApiToken> {
  if (item.kind === KEY_MANAGEMENT_ENTRY_KINDS.ServiceCredential) {
    return {
      id: 0,
      user_id: 0,
      key: item.credential.key,
      status: 1,
      name: item.credential.label,
      created_time: 0,
      accessed_time: 0,
      expired_time: -1,
      remain_quota: 0,
      unlimited_quota: false,
      used_quota: 0,
    }
  }

  return resolveExportTokenForSecret(item.account, item.token)
}

/**
 * Normalizes edited model mappings before they are shared across the batch.
 */
function normalizeModels(
  models: React.ComponentProps<typeof ModelListInput>["value"],
): CliProxyModelMapping[] {
  return models
    .map((item) => {
      const name = item.name.trim()
      const alias = item.alias.trim()
      return {
        name,
        alias: alias || undefined,
      }
    })
    .filter((item) => item.name.length > 0)
}

/**
 * Maps batch execution states to existing badge styles.
 */
function getResultBadgeVariant(status: ExecutionStatus) {
  switch (status) {
    case EXECUTION_STATUSES.Success:
      return "success" as const
    case EXECUTION_STATUSES.Failed:
      return "danger" as const
    case EXECUTION_STATUSES.Running:
      return "info" as const
    case EXECUTION_STATUSES.Pending:
    default:
      return "secondary" as const
  }
}

/**
 * Resolves static translation keys for batch execution states.
 */
function getResultStatusText(
  t: ReturnType<typeof useTranslation>["t"],
  status: ExecutionStatus,
) {
  switch (status) {
    case EXECUTION_STATUSES.Success:
      return t("keyManagement:batchCliProxyExport.results.success")
    case EXECUTION_STATUSES.Failed:
      return t("keyManagement:batchCliProxyExport.results.failed")
    case EXECUTION_STATUSES.Running:
      return t("keyManagement:batchCliProxyExport.results.running")
    case EXECUTION_STATUSES.Pending:
    default:
      return t("keyManagement:batchCliProxyExport.results.pending")
  }
}

/**
 * Imports selected Key Management tokens into CLIProxyAPI with shared settings.
 */
export function BatchCliProxyExportDialog({
  isOpen,
  onClose,
  items,
}: BatchCliProxyExportDialogProps) {
  const { t } = useTranslation(["keyManagement", "ui", "common", "messages"])
  const [providerType, setProviderType] = useState<CliProxyProviderType>(
    CLI_PROXY_PROVIDER_TYPES.OPENAI_COMPATIBILITY,
  )
  const [proxyUrl, setProxyUrl] = useState("")
  const [models, setModels] = useState<
    React.ComponentProps<typeof ModelListInput>["value"]
  >([])
  const [hasEditedModels, setHasEditedModels] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [executionStateById, setExecutionStateById] = useState<
    Record<string, ExecutionState>
  >({})
  const providerTypeDescription = `${t("ui:dialog.cliproxy.descriptions.providerType")} ${getCliProxyProviderTypeDescription(t, providerType)}`

  useEffect(() => {
    if (!isOpen) {
      setProviderType(CLI_PROXY_PROVIDER_TYPES.OPENAI_COMPATIBILITY)
      setProxyUrl("")
      setModels([])
      setHasEditedModels(false)
      setIsRunning(false)
      setExecutionStateById({})
      return
    }

    setExecutionStateById({})
  }, [isOpen])

  const previewItems = useMemo(
    () =>
      items.map((item) => {
        return {
          ...item,
          id:
            item.kind === KEY_MANAGEMENT_ENTRY_KINDS.ServiceCredential
              ? buildServiceCredentialEntryIdentityKey(
                  item.account.id,
                  item.credential.service,
                )
              : buildTokenIdentityKey(item.token.accountId, item.token.id),
          tokenName: getEntryTokenName(item),
          providerName: buildProviderName(item),
          providerBaseUrl: buildDefaultCliProxyProviderBaseUrl(providerType, {
            ...item.account,
            baseUrl: getEntryBaseUrl(item),
          }),
        }
      }),
    [items, providerType],
  )

  const statusCounts = useMemo(() => {
    return previewItems.reduce(
      (counts, item) => {
        const status =
          executionStateById[item.id]?.status ?? EXECUTION_STATUSES.Pending
        counts[status] += 1
        return counts
      },
      {
        pending: 0,
        running: 0,
        success: 0,
        failed: 0,
      } satisfies Record<ExecutionStatus, number>,
    )
  }, [executionStateById, previewItems])

  const handleProviderTypeChange = (nextProviderType: string) => {
    setProviderType(nextProviderType as CliProxyProviderType)
  }

  const handleStart = async () => {
    if (isRunning || previewItems.length === 0) return

    const tracker = startProductAnalyticsAction({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ImportExport,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.ExportAccountTokensToCliProxy,
      surfaceId:
        PRODUCT_ANALYTICS_SURFACE_IDS.AccountTokenThirdPartyExportDialog,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    const normalizedModels = hasEditedModels
      ? normalizeModels(models)
      : undefined
    let successCount = 0
    let failureCount = 0

    setIsRunning(true)
    setExecutionStateById(
      Object.fromEntries(
        previewItems.map((item) => [
          item.id,
          { status: EXECUTION_STATUSES.Pending },
        ]),
      ),
    )

    for (const item of previewItems) {
      setExecutionStateById((current) => ({
        ...current,
        [item.id]: { status: EXECUTION_STATUSES.Running },
      }))

      try {
        const resolvedToken = await resolveCliProxyExportToken(item)
        const result = await importToCliProxy({
          account: item.account,
          token: resolvedToken,
          providerType,
          providerName: item.providerName,
          providerBaseUrl:
            normalizeCliProxyProviderBaseUrl(
              providerType,
              item.providerBaseUrl,
            ) || undefined,
          proxyUrl: proxyUrl.trim(),
          models: normalizedModels,
        })

        showResultToast(result)

        if (result.success) {
          successCount += 1
          setExecutionStateById((current) => ({
            ...current,
            [item.id]: {
              status: EXECUTION_STATUSES.Success,
              message: result.message,
            },
          }))
        } else {
          failureCount += 1
          setExecutionStateById((current) => ({
            ...current,
            [item.id]: {
              status: EXECUTION_STATUSES.Failed,
              message: result.message,
            },
          }))
        }
      } catch (error) {
        const message = getErrorMessage(error)
        failureCount += 1
        setExecutionStateById((current) => ({
          ...current,
          [item.id]: { status: EXECUTION_STATUSES.Failed, message },
        }))
        showResultToast({
          success: false,
          message: t("messages:errors.operation.failed", {
            error: message,
          }),
        })
      }
    }

    const result =
      failureCount === 0
        ? PRODUCT_ANALYTICS_RESULTS.Success
        : PRODUCT_ANALYTICS_RESULTS.Failure

    tracker.complete(result, {
      insights: {
        itemCount: previewItems.length,
        successCount,
        failureCount,
      },
    })
    setIsRunning(false)
  }

  const footer = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="text-muted-foreground text-sm" aria-live="polite">
        {t("keyManagement:batchCliProxyExport.summary", {
          total: previewItems.length,
          success: statusCounts.success,
          failed: statusCounts.failed,
        })}
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={onClose}
          disabled={isRunning}
        >
          {t("common:actions.cancel")}
        </Button>
        <Button
          type="button"
          disabled={isRunning || previewItems.length === 0}
          leftIcon={
            isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined
          }
          onClick={() => void handleStart()}
        >
          {isRunning
            ? t("keyManagement:batchCliProxyExport.actions.running")
            : t("keyManagement:batchCliProxyExport.actions.start")}
        </Button>
      </div>
    </div>
  )

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      closeOnBackdropClick={!isRunning}
      closeOnEsc={!isRunning}
      showCloseButton={!isRunning}
      size="lg"
      header={
        <div className="flex items-center gap-2">
          <CliProxyIcon size="lg" />
          <div>
            <div className="text-base font-semibold">
              {t("keyManagement:batchCliProxyExport.title")}
            </div>
            <p className="text-muted-foreground text-sm">
              {t("keyManagement:batchCliProxyExport.description", {
                selectedCount: previewItems.length,
              })}
            </p>
          </div>
        </div>
      }
      footer={footer}
    >
      <div className="space-y-4">
        <div className="grid gap-3 rounded-md border p-3 md:grid-cols-2">
          <FormField
            label={t("ui:dialog.cliproxy.fields.providerType")}
            description={providerTypeDescription}
          >
            <Select
              value={providerType}
              onValueChange={handleProviderTypeChange}
              disabled={isRunning}
            >
              <SelectTrigger
                aria-label={t("ui:dialog.cliproxy.fields.providerType")}
              >
                <SelectValue
                  placeholder={t(
                    "ui:dialog.cliproxy.placeholders.providerType",
                  )}
                />
              </SelectTrigger>
              <SelectContent>
                {Object.values(CLI_PROXY_PROVIDER_TYPES).map((value) => (
                  <SelectItem key={value} value={value}>
                    {getCliProxyProviderTypeLabel(t, value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField
            label={t("ui:dialog.cliproxy.fields.proxyUrl")}
            description={t("ui:dialog.cliproxy.descriptions.proxyUrl")}
          >
            <Input
              aria-label={t("ui:dialog.cliproxy.fields.proxyUrl")}
              value={proxyUrl}
              disabled={isRunning}
              onChange={(event) => setProxyUrl(event.target.value)}
              placeholder={t("ui:dialog.cliproxy.placeholders.proxyUrl")}
            />
          </FormField>

          <div className="md:col-span-2">
            <FormField
              label={t("ui:dialog.cliproxy.fields.models")}
              description={t("ui:dialog.cliproxy.descriptions.modelsManual")}
            >
              <ModelListInput
                value={models}
                onChange={(nextModels) => {
                  setHasEditedModels(true)
                  setModels(nextModels)
                }}
                showHeader={false}
                strings={{
                  addLabel: t("ui:dialog.cliproxy.actions.addModel"),
                  removeLabel: t("ui:dialog.cliproxy.actions.removeModel"),
                  dragHandleLabel: t("ui:dialog.cliproxy.actions.reorderModel"),
                  namePlaceholder: t(
                    "ui:dialog.cliproxy.placeholders.modelName",
                  ),
                  aliasPlaceholder: t(
                    "ui:dialog.cliproxy.placeholders.modelAlias",
                  ),
                }}
              />
            </FormField>
          </div>
        </div>

        <div className="max-h-[45vh] space-y-2 overflow-y-auto rounded-md border p-3">
          {previewItems.map((item) => {
            const state = executionStateById[item.id] ?? {
              status: EXECUTION_STATUSES.Pending,
            }
            return (
              <div key={item.id} className="space-y-1 rounded-md border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {item.tokenName}
                    </div>
                    <div className="text-muted-foreground truncate text-xs">
                      {item.account.name}
                    </div>
                  </div>
                  <Badge
                    variant={getResultBadgeVariant(state.status)}
                    size="sm"
                  >
                    {getResultStatusText(t, state.status)}
                  </Badge>
                </div>
                <div className="grid gap-1 text-xs md:grid-cols-2">
                  <div className="min-w-0">
                    <span className="text-muted-foreground">
                      {t("ui:dialog.cliproxy.fields.name")}
                    </span>
                    <span className="ml-2 break-words">
                      {item.providerName}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <span className="text-muted-foreground">
                      {t("ui:dialog.cliproxy.fields.baseUrl")}
                    </span>
                    <span className="ml-2 break-all">
                      {item.providerBaseUrl || "-"}
                    </span>
                  </div>
                </div>
                {state.message ? (
                  <div className="text-muted-foreground text-xs break-words">
                    {state.message}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      </div>
    </Modal>
  )
}
