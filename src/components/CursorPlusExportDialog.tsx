import { useCallback, useEffect, useMemo, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import {
  Alert,
  Button,
  CompactMultiSelect,
  FormField,
  Input,
  Modal,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui"
import {
  buildProviderModelDiscoveryCacheKey,
  PROVIDER_MODEL_DISCOVERY_STATUSES,
  useProviderModelDiscovery,
} from "~/hooks/useProviderModelDiscovery"
import { useSafeExportAction } from "~/hooks/useSafeExportAction"
import type { AccountRuntimeKey } from "~/services/accounts/accountRuntimeKeys"
import { resolveDisplayAccountRuntimeKeySecret } from "~/services/accounts/utils/apiServiceRequest"
import {
  CURSOR_PLUS_PROVIDER_TYPES,
  prepareCursorPlusProvider,
  type CursorPlusProviderType,
} from "~/services/integrations/cursorPlusExport"
import { startProductAnalyticsAction } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import type { DisplaySiteData } from "~/types"
import { getErrorMessage } from "~/utils/core/error"
import { coerceBaseUrlToPathSuffix } from "~/utils/core/url"

import { CURSOR_PLUS_EXPORT_TEST_IDS } from "./CursorPlusExportDialog.testIds"

interface CursorPlusExportDialogProps {
  isOpen: boolean
  onClose: () => void
  account: DisplaySiteData
  runtimeKey: AccountRuntimeKey
}

const cursorPlusExportAnalyticsContext = {
  featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ImportExport,
  actionId: PRODUCT_ANALYTICS_ACTION_IDS.CopyCursorPlusProviderConfig,
  surfaceId:
    PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountRuntimeKeyCursorPlusExportDialog,
  entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
}

const CURSOR_PLUS_PROTOCOL_OPTIONS = [
  CURSOR_PLUS_PROVIDER_TYPES.OpenAIChat,
  CURSOR_PLUS_PROVIDER_TYPES.OpenAIResponses,
  CURSOR_PLUS_PROVIDER_TYPES.Anthropic,
  CURSOR_PLUS_PROVIDER_TYPES.Gemini,
] as const

/** Check whether Cursor++ can use the configured provider base URL. */
function isValidCursorPlusBaseUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}

/** Copy one OpenAI-compatible runtime key as a Cursor++ provider fragment. */
export function CursorPlusExportDialog({
  isOpen,
  onClose,
  account,
  runtimeKey,
}: CursorPlusExportDialogProps) {
  const { t } = useTranslation(["ui", "common", "messages"])
  const getProtocolLabel = (value: CursorPlusProviderType) => {
    switch (value) {
      case CURSOR_PLUS_PROVIDER_TYPES.Anthropic:
        return t("ui:dialog.cursorPlus.protocols.anthropic")
      case CURSOR_PLUS_PROVIDER_TYPES.Gemini:
        return t("ui:dialog.cursorPlus.protocols.gemini")
      case CURSOR_PLUS_PROVIDER_TYPES.OpenAIResponses:
        return t("ui:dialog.cursorPlus.protocols.openAIResponses")
      case CURSOR_PLUS_PROVIDER_TYPES.OpenAIChat:
        return t("ui:dialog.cursorPlus.protocols.openAIChat")
    }
  }
  const defaultProviderName = `${account.name} - ${runtimeKey.label}`
  const defaultBaseUrl = useMemo(
    () => coerceBaseUrlToPathSuffix(runtimeKey.baseUrl, "/v1"),
    [runtimeKey.baseUrl],
  )
  const [providerName, setProviderName] = useState(defaultProviderName)
  const [baseUrl, setBaseUrl] = useState(defaultBaseUrl)
  const [protocol, setProtocol] = useState<CursorPlusProviderType>(
    CURSOR_PLUS_PROVIDER_TYPES.OpenAIChat,
  )
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>([])
  const [hasCustomizedModels, setHasCustomizedModels] = useState(false)

  const discoveryCacheKey = useMemo(
    () =>
      buildProviderModelDiscoveryCacheKey([
        runtimeKey.id,
        runtimeKey.baseUrl,
        runtimeKey.secret,
      ]),
    [runtimeKey.baseUrl, runtimeKey.id, runtimeKey.secret],
  )
  const discoverySources = useMemo(
    () => [
      {
        selectionId: runtimeKey.id,
        cacheKey: discoveryCacheKey,
        baseUrl: runtimeKey.baseUrl,
        resolveApiKey: async () => {
          const resolvedRuntimeKey =
            await resolveDisplayAccountRuntimeKeySecret(account, runtimeKey)
          return resolvedRuntimeKey.secret
        },
      },
    ],
    [account, discoveryCacheKey, runtimeKey],
  )
  const { getInventory, loadModels } = useProviderModelDiscovery({
    isOpen,
    sources: discoverySources,
  })
  const inventory = getInventory(runtimeKey.id)

  useEffect(() => {
    if (!isOpen) return
    setProviderName(defaultProviderName)
    setBaseUrl(defaultBaseUrl)
    setProtocol(CURSOR_PLUS_PROVIDER_TYPES.OpenAIChat)
    setSelectedModelIds([])
    setHasCustomizedModels(false)
  }, [defaultBaseUrl, defaultProviderName, discoveryCacheKey, isOpen])

  useEffect(() => {
    if (
      inventory.status !== PROVIDER_MODEL_DISCOVERY_STATUSES.Loaded ||
      hasCustomizedModels
    ) {
      return
    }
    setSelectedModelIds(inventory.modelIds)
  }, [hasCustomizedModels, inventory.modelIds, inventory.status])

  const exportActionSignature = useMemo(
    () =>
      JSON.stringify({
        baseUrl: baseUrl.trim(),
        discoveryCacheKey,
        providerName: providerName.trim(),
        protocol,
        selectedModelIds,
      }),
    [baseUrl, discoveryCacheKey, protocol, providerName, selectedModelIds],
  )
  const {
    begin: beginExportAction,
    invalidate: invalidateExportAction,
    isRunning: isCopying,
  } = useSafeExportAction({
    isOpen,
    signature: exportActionSignature,
  })

  const hasValidBaseUrl = isValidCursorPlusBaseUrl(baseUrl)
  const canCopy =
    Boolean(providerName.trim()) &&
    hasValidBaseUrl &&
    selectedModelIds.length > 0

  const handleCopy = async () => {
    if (!canCopy) return
    const action = beginExportAction()
    if (!action) return

    const tracker = startProductAnalyticsAction(
      cursorPlusExportAnalyticsContext,
    )
    try {
      const resolvedRuntimeKey = await resolveDisplayAccountRuntimeKeySecret(
        account,
        runtimeKey,
      )
      if (!action.isCurrent()) return
      const provider = prepareCursorPlusProvider({
        selectionId: runtimeKey.id,
        name: providerName,
        baseUrl,
        apiKey: resolvedRuntimeKey.secret,
        discoveredModelIds: selectedModelIds,
        protocol,
      })
      await navigator.clipboard.writeText(JSON.stringify(provider, null, 2))
      if (!action.isCurrent()) return
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success, {
        insights: { itemCount: 1, modelCount: provider.models.length },
      })
      toast.success(t("ui:dialog.cursorPlus.messages.copySuccess"))
    } catch (error) {
      if (!action.isCurrent()) return
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      })
      toast.error(
        t("ui:dialog.cursorPlus.messages.copyFailed", {
          error: getErrorMessage(error, t("messages:errors.unknown")),
        }),
      )
    } finally {
      action.finish()
    }
  }

  const handleClose = useCallback(() => {
    invalidateExportAction()
    onClose()
  }, [invalidateExportAction, onClose])

  const isLoading =
    inventory.status === PROVIDER_MODEL_DISCOVERY_STATUSES.Idle ||
    inventory.status === PROVIDER_MODEL_DISCOVERY_STATUSES.Loading
  const isError = inventory.status === PROVIDER_MODEL_DISCOVERY_STATUSES.Error
  const isEmpty =
    inventory.status === PROVIDER_MODEL_DISCOVERY_STATUSES.Loaded &&
    inventory.modelIds.length === 0
  const modelOptions = useMemo(
    () =>
      inventory.modelIds.map((modelId) => ({ value: modelId, label: modelId })),
    [inventory.modelIds],
  )

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      panelTestId={CURSOR_PLUS_EXPORT_TEST_IDS.dialog}
      header={
        <div className="pr-8">
          <div className="dark:text-dark-text-primary text-base font-semibold text-gray-900">
            {t("ui:dialog.cursorPlus.title")}
          </div>
          <p className="dark:text-dark-text-secondary text-sm text-gray-500">
            {t("ui:dialog.cursorPlus.description")}
          </p>
        </div>
      }
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={handleClose}>
            {t("common:actions.cancel")}
          </Button>
          <Button
            type="button"
            data-testid={CURSOR_PLUS_EXPORT_TEST_IDS.copyButton}
            disabled={!canCopy || isCopying}
            loading={isCopying}
            onClick={() => void handleCopy()}
          >
            {t("ui:dialog.cursorPlus.actions.copy")}
          </Button>
        </div>
      }
    >
      <Alert
        variant="info"
        title={t("ui:dialog.cursorPlus.guidance.title")}
        description={t("ui:dialog.cursorPlus.guidance.description")}
      />

      <FormField label={t("ui:dialog.cursorPlus.labels.providerName")}>
        <Input
          value={providerName}
          data-testid={CURSOR_PLUS_EXPORT_TEST_IDS.providerNameInput}
          onChange={(event) => setProviderName(event.target.value)}
        />
      </FormField>

      <FormField
        label={t("ui:dialog.cursorPlus.labels.baseUrl")}
        description={t("ui:dialog.cursorPlus.labels.baseUrlDescription")}
        error={
          hasValidBaseUrl
            ? undefined
            : t("ui:dialog.cursorPlus.messages.invalidBaseUrl")
        }
      >
        <Input
          value={baseUrl}
          data-testid={CURSOR_PLUS_EXPORT_TEST_IDS.baseUrlInput}
          aria-invalid={!hasValidBaseUrl}
          onChange={(event) => setBaseUrl(event.target.value)}
        />
      </FormField>

      <FormField
        label={t("ui:dialog.cursorPlus.labels.protocol")}
        description={t("ui:dialog.cursorPlus.labels.protocolDescription")}
      >
        <Select
          value={protocol}
          onValueChange={(value) => {
            const option = CURSOR_PLUS_PROTOCOL_OPTIONS.find(
              (candidate) => candidate === value,
            )
            if (option) setProtocol(option)
          }}
        >
          <SelectTrigger aria-label={t("ui:dialog.cursorPlus.labels.protocol")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CURSOR_PLUS_PROTOCOL_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {getProtocolLabel(option)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      {isLoading ? (
        <div
          role="status"
          className="dark:text-dark-text-tertiary text-sm text-gray-500"
        >
          {t("ui:dialog.cursorPlus.status.loading")}
        </div>
      ) : null}
      {!isLoading && !isError && !isEmpty ? (
        <div className="dark:text-dark-text-tertiary text-sm text-gray-500">
          {t("ui:dialog.cursorPlus.status.loaded", {
            count: inventory.modelIds.length,
          })}
        </div>
      ) : null}
      {isError || isEmpty ? (
        <Alert
          variant={isError ? "destructive" : "warning"}
          title={
            isError
              ? t("ui:dialog.cursorPlus.status.error")
              : t("ui:dialog.cursorPlus.status.empty")
          }
          description={t("ui:dialog.cursorPlus.status.manualRecovery")}
        >
          <Button
            type="button"
            variant="secondary"
            size="sm"
            data-testid={CURSOR_PLUS_EXPORT_TEST_IDS.retryButton}
            onClick={() => void loadModels(runtimeKey.id)}
          >
            {t("ui:dialog.cursorPlus.actions.retry")}
          </Button>
        </Alert>
      ) : null}

      <FormField
        label={t("ui:dialog.cursorPlus.labels.models")}
        description={t("ui:dialog.cursorPlus.labels.modelsDescription")}
      >
        <CompactMultiSelect
          options={modelOptions}
          selected={selectedModelIds}
          onChange={(values) => {
            setHasCustomizedModels(true)
            setSelectedModelIds(values)
          }}
          aria-label={t("ui:dialog.cursorPlus.labels.models")}
          inputTestId={CURSOR_PLUS_EXPORT_TEST_IDS.modelSelectorInput}
          placeholder={t("ui:dialog.cursorPlus.placeholders.models")}
          searchPlaceholder={t(
            "ui:dialog.cursorPlus.placeholders.searchModels",
          )}
          allowCustom
          parseCommaStrings
          clearable
          bulkActionsMinOptions={2}
        />
      </FormField>

      <Alert
        variant="warning"
        title={t("ui:dialog.cursorPlus.warning.title")}
        description={t("ui:dialog.cursorPlus.warning.description")}
      />
    </Modal>
  )
}
