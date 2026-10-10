import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  ActionGroup,
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
import { CURSOR_PLUS_EXPORT_TEST_IDS } from "~/features/CredentialExport/CursorPlusExportDialog.testIds"
import {
  PROVIDER_MODEL_DISCOVERY_STATUSES,
  useProviderModelDiscovery,
} from "~/features/CredentialExport/useProviderModelDiscovery"
import { useSafeExportAction } from "~/features/CredentialExport/useSafeExportAction"
import toast from "~/lib/notify"
import {
  toProtocolRoot,
  toVersionedProtocolMount,
} from "~/services/aiApi/protocolAddress"
import type { CredentialExportSource } from "~/services/integrations/credentialExport"
import {
  CURSOR_PLUS_PROVIDER_TYPES,
  prepareCursorPlusProvider,
  type CursorPlusProviderType,
} from "~/services/integrations/cursorPlusExport"
import type { ProductAnalyticsActionContext } from "~/services/productAnalytics/actionConfig"
import { startProductAnalyticsAction } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import { getErrorMessage } from "~/utils/core/error"

interface CursorPlusExportDialogProps {
  isOpen: boolean
  onClose: () => void
  source: CredentialExportSource
  analyticsContext?: ProductAnalyticsActionContext
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

/**
 * Address Cursor++ must be configured with for the selected protocol.
 *
 * Cursor++ passes the provider URL straight into that protocol's SDK, and the
 * SDKs disagree about who owns the version segment: the OpenAI SDK appends only
 * `/chat/completions` or `/responses` (so it needs the versioned mount), while
 * the Anthropic and Google SDKs append `/v1/messages` and `/v1beta` themselves
 * (so they need the protocol root). A declared Anthropic endpoint wins over the
 * OpenAI address for the Anthropic protocol.
 *
 * Verified against cursor++ 0.0.15: `cursor2plus-0.0.15.vsix` builds each client
 * with `baseURL: provider.baseUrl` and no path of its own.
 */
function getProtocolDefaultBaseUrl(
  baseUrl: string,
  anthropicBaseUrl: string | undefined,
  protocol: CursorPlusProviderType,
): string {
  if (protocol === CURSOR_PLUS_PROVIDER_TYPES.Anthropic) {
    return toProtocolRoot("anthropic", anthropicBaseUrl ?? baseUrl) ?? baseUrl
  }

  if (protocol === CURSOR_PLUS_PROVIDER_TYPES.Gemini) {
    return toProtocolRoot("google", baseUrl) ?? baseUrl
  }

  return toVersionedProtocolMount("openai-compatible", baseUrl) ?? baseUrl
}

/** Copy one OpenAI-compatible runtime key as a Cursor++ provider fragment. */
export function CursorPlusExportDialog({
  isOpen,
  onClose,
  source,
  analyticsContext = cursorPlusExportAnalyticsContext,
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
  const defaultProviderName = `${source.providerName} - ${source.credentialName}`
  const [providerName, setProviderName] = useState(defaultProviderName)
  const [protocol, setProtocol] = useState<CursorPlusProviderType>(
    CURSOR_PLUS_PROVIDER_TYPES.OpenAIChat,
  )
  const [baseUrl, setBaseUrl] = useState(() =>
    getProtocolDefaultBaseUrl(
      source.baseUrl,
      source.anthropicBaseUrl,
      CURSOR_PLUS_PROVIDER_TYPES.OpenAIChat,
    ),
  )
  const [isBaseUrlCustomized, setIsBaseUrlCustomized] = useState(false)
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>([])
  const [hasCustomizedModels, setHasCustomizedModels] = useState(false)

  const discoveryCacheKey = source.cacheKey
  const discoverySources = useMemo(
    () => [
      {
        selectionId: source.id,
        cacheKey: discoveryCacheKey,
        baseUrl: source.baseUrl,
        resolveApiKey: source.resolveApiKey,
        requestHeaders: source.requestHeaders,
      },
    ],
    [discoveryCacheKey, source],
  )
  const { getInventory, loadModels } = useProviderModelDiscovery({
    isOpen,
    sources: discoverySources,
  })
  const inventory = getInventory(source.id)

  useEffect(() => {
    if (!isOpen) return
    setProviderName(defaultProviderName)
    setProtocol(CURSOR_PLUS_PROVIDER_TYPES.OpenAIChat)
    setBaseUrl(
      getProtocolDefaultBaseUrl(
        source.baseUrl,
        source.anthropicBaseUrl,
        CURSOR_PLUS_PROVIDER_TYPES.OpenAIChat,
      ),
    )
    setIsBaseUrlCustomized(false)
    setSelectedModelIds([])
    setHasCustomizedModels(false)
  }, [
    defaultProviderName,
    discoveryCacheKey,
    isOpen,
    source.anthropicBaseUrl,
    source.baseUrl,
  ])

  // Cursor++ hands this URL to the SDK of the selected protocol, so switching
  // protocol rewrites the default until the user edits the field themselves.
  useEffect(() => {
    if (!isOpen || isBaseUrlCustomized) return
    setBaseUrl(
      getProtocolDefaultBaseUrl(
        source.baseUrl,
        source.anthropicBaseUrl,
        protocol,
      ),
    )
  }, [
    isBaseUrlCustomized,
    isOpen,
    protocol,
    source.anthropicBaseUrl,
    source.baseUrl,
  ])

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

    const tracker = startProductAnalyticsAction(analyticsContext)
    try {
      const apiKey = await source.resolveApiKey()
      if (!action.isCurrent()) return
      const provider = prepareCursorPlusProvider({
        selectionId: source.id,
        name: providerName,
        baseUrl,
        apiKey,
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
          <div className="text-foreground text-base font-semibold">
            {t("ui:dialog.cursorPlus.title")}
          </div>
          <p className="dark:text-secondary-foreground text-muted-foreground text-sm">
            {t("ui:dialog.cursorPlus.description")}
          </p>
        </div>
      }
      footer={
        <ActionGroup>
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
        </ActionGroup>
      }
    >
      <Alert
        variant="primary"
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
          onChange={(event) => {
            setIsBaseUrlCustomized(true)
            setBaseUrl(event.target.value)
          }}
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

      {!isLoading && !isError && !isEmpty ? (
        <div className="dark:text-secondary-foreground text-muted-foreground text-sm">
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
            onClick={() => void loadModels(source.id)}
          >
            {t("ui:dialog.cursorPlus.actions.retry")}
          </Button>
        </Alert>
      ) : null}

      <FormField
        label={t("ui:dialog.cursorPlus.labels.models")}
        description={t("ui:dialog.cursorPlus.labels.modelsDescription")}
      >
        <span role="status" aria-live="polite" className="sr-only">
          {isLoading ? t("ui:dialog.cursorPlus.status.loading") : ""}
        </span>
        <CompactMultiSelect
          options={modelOptions}
          loading={isLoading}
          aria-description={
            isLoading ? t("ui:dialog.cursorPlus.status.loading") : undefined
          }
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
