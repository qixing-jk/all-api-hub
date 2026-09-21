import type { TFunction } from "i18next"
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react"
import { useTranslation } from "react-i18next"

import {
  ActionGroup,
  Button,
  Input,
  Label,
  Modal,
  SearchableSelect,
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
import toast from "~/lib/notify"
import {
  AI_TOOLBOX_API_FORMATS,
  AI_TOOLBOX_APPS,
  openInAiToolbox,
  type AiToolboxApp,
} from "~/services/integrations/aiToolbox"
import {
  resolveCredentialExport,
  type CredentialExportSource,
} from "~/services/integrations/credentialExport"
import {
  startProductAnalyticsAction,
  type ProductAnalyticsActionContext,
} from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"

import { AI_TOOLBOX_EXPORT_TEST_IDS } from "./AiToolboxExportDialog.testIds"
import { UPSTREAM_MODEL_FETCH_DEBOUNCE_MS } from "./ClaudeCodeRouterImportDialog"

interface AiToolboxExportDialogProps {
  isOpen: boolean
  onClose: () => void
  source: CredentialExportSource
  analyticsContext?: ProductAnalyticsActionContext
}

/**
 * Unified logger scoped to the AI Toolbox export dialog.
 */
const logger = createLogger("AiToolboxExportDialog")

const DEFAULT_APP: AiToolboxApp = "claude"
/**
 * Sentinel for "let AI Toolbox use the target app's native protocol". Radix
 * selects cannot carry an empty string value, so the option needs a real token.
 */
const AUTOMATIC_API_FORMAT = "automatic"

const API_FORMAT_OPTIONS = [
  AUTOMATIC_API_FORMAT,
  AI_TOOLBOX_API_FORMATS.AnthropicMessages,
  AI_TOOLBOX_API_FORMATS.OpenAIResponses,
  AI_TOOLBOX_API_FORMATS.OpenAIChat,
  AI_TOOLBOX_API_FORMATS.GeminiNative,
] as const

type ApiFormatOption = (typeof API_FORMAT_OPTIONS)[number]

const getAiToolboxAppLabel = (t: TFunction, app: AiToolboxApp) => {
  switch (app) {
    case "claude":
      return t("ui:dialog.aiToolbox.appOptions.claude")
    case "claudedesktop":
      return t("ui:dialog.aiToolbox.appOptions.claudedesktop")
    case "codex":
      return t("ui:dialog.aiToolbox.appOptions.codex")
    case "grok":
      return t("ui:dialog.aiToolbox.appOptions.grok")
    case "kimi":
      return t("ui:dialog.aiToolbox.appOptions.kimi")
    case "gemini":
      return t("ui:dialog.aiToolbox.appOptions.gemini")
    case "opencode":
      return t("ui:dialog.aiToolbox.appOptions.opencode")
    case "openclaw":
      return t("ui:dialog.aiToolbox.appOptions.openclaw")
    case "pi":
      return t("ui:dialog.aiToolbox.appOptions.pi")
    case "omp":
      return t("ui:dialog.aiToolbox.appOptions.omp")
    case "hermes":
      return t("ui:dialog.aiToolbox.appOptions.hermes")
    case "dsh":
      return t("ui:dialog.aiToolbox.appOptions.dsh")
  }
}

const getApiFormatLabel = (t: TFunction, option: ApiFormatOption) => {
  switch (option) {
    case AUTOMATIC_API_FORMAT:
      return t("ui:dialog.aiToolbox.formatOptions.automatic")
    case AI_TOOLBOX_API_FORMATS.AnthropicMessages:
      return t("ui:dialog.aiToolbox.formatOptions.anthropicMessages")
    case AI_TOOLBOX_API_FORMATS.OpenAIResponses:
      return t("ui:dialog.aiToolbox.formatOptions.openAIResponses")
    case AI_TOOLBOX_API_FORMATS.OpenAIChat:
      return t("ui:dialog.aiToolbox.formatOptions.openAIChat")
    case AI_TOOLBOX_API_FORMATS.GeminiNative:
      return t("ui:dialog.aiToolbox.formatOptions.geminiNative")
  }
}

/**
 * Presents a modal for exporting a credential into AI Toolbox.
 * Prefills provider metadata and lets the user tweak the target app, base URL,
 * API protocol, default model, and helper notes.
 * @param props Component props bundle.
 * @param props.isOpen Whether the dialog is visible.
 * @param props.onClose Callback invoked when the dialog should close.
 * @param props.source Provider metadata and deferred credential resolution.
 */
export function AiToolboxExportDialog(props: AiToolboxExportDialogProps) {
  const { isOpen, onClose, source, analyticsContext } = props
  const { t } = useTranslation(["ui", "common"])
  const [app, setApp] = useState<AiToolboxApp>(DEFAULT_APP)
  const [apiFormat, setApiFormat] =
    useState<ApiFormatOption>(AUTOMATIC_API_FORMAT)
  const [model, setModel] = useState("")
  const [notes, setNotes] = useState("")
  const [providerName, setProviderName] = useState(source.providerName)
  const [homepage, setHomepage] = useState(source.baseUrl)
  // AI Toolbox names the shared connection field `baseUrl` and rebuilds the
  // tool-specific settings itself, so the stored URL is sent verbatim.
  // https://github.com/coulsontl/ai-toolbox/blob/v1.1.5/tauri/src/coding/deeplink/provider.rs
  const [baseUrl, setBaseUrl] = useState(source.baseUrl)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const formId = useId()

  // Model discovery follows the endpoint the export will actually target, not
  // the stored URL the user may be replacing. Debounced so typing does not
  // fire a discovery request per keystroke.
  const [discoveryBaseUrl, setDiscoveryBaseUrl] = useState(source.baseUrl)
  useEffect(() => {
    const handle = setTimeout(
      () => setDiscoveryBaseUrl(baseUrl),
      UPSTREAM_MODEL_FETCH_DEBOUNCE_MS,
    )
    return () => clearTimeout(handle)
  }, [baseUrl])

  // Closing the dialog or swapping the source invalidates an in-flight export
  // so a late credential resolution cannot send the key after a cancel.
  const exportGenerationRef = useRef(0)
  const invalidatePendingExport = useCallback(() => {
    exportGenerationRef.current += 1
  }, [])
  useEffect(() => {
    return invalidatePendingExport
  }, [source, invalidatePendingExport])
  const handleClose = useCallback(() => {
    invalidatePendingExport()
    onClose()
  }, [invalidatePendingExport, onClose])

  const discoverySources = useMemo(
    () => [
      {
        selectionId: source.id,
        cacheKey: buildProviderModelDiscoveryCacheKey([
          source.cacheKey,
          discoveryBaseUrl,
        ]),
        baseUrl: discoveryBaseUrl,
        resolveApiKey: source.resolveApiKey,
      },
    ],
    [source, discoveryBaseUrl],
  )
  const { getInventory, loadModels } = useProviderModelDiscovery({
    isOpen,
    sources: discoverySources,
  })
  const inventory = getInventory(source.id)
  const isLoadingModels =
    inventory.status === PROVIDER_MODEL_DISCOVERY_STATUSES.Idle ||
    inventory.status === PROVIDER_MODEL_DISCOVERY_STATUSES.Loading
  const upstreamModelOptions = useMemo(
    () =>
      inventory.modelIds.map((modelId) => ({
        value: modelId,
        label: modelId,
      })),
    [inventory.modelIds],
  )
  // A failed inventory keeps the picker usable for a hand-typed model id.
  const isModelDiscoveryFailed =
    inventory.status === PROVIDER_MODEL_DISCOVERY_STATUSES.Error

  useEffect(() => {
    if (isOpen) {
      setApp(DEFAULT_APP)
      setApiFormat(AUTOMATIC_API_FORMAT)
      setModel("")
      setNotes(source.notes ?? "")
      setProviderName(source.providerName)
      setHomepage(source.baseUrl)
      setBaseUrl(source.baseUrl)
    }
  }, [source.baseUrl, source.id, source.providerName, source.notes, isOpen])

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isSubmitting) return

    void (async () => {
      const generation = exportGenerationRef.current + 1
      exportGenerationRef.current = generation
      setIsSubmitting(true)
      const tracker = startProductAnalyticsAction(
        analyticsContext ?? {
          featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ImportExport,
          actionId: PRODUCT_ANALYTICS_ACTION_IDS.ExportAccountTokenToAiToolbox,
          surfaceId:
            PRODUCT_ANALYTICS_SURFACE_IDS.AccountTokenThirdPartyExportDialog,
          entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        },
      )

      try {
        const credential = await resolveCredentialExport(source)
        if (exportGenerationRef.current !== generation) {
          tracker.complete(PRODUCT_ANALYTICS_RESULTS.Cancelled)
          return
        }

        const selectedModel = model.trim()
        const discoveredModelIds = inventory.modelIds
        const modelIds =
          selectedModel && !discoveredModelIds.includes(selectedModel)
            ? [...discoveredModelIds, selectedModel]
            : discoveredModelIds
        const opened = openInAiToolbox({
          credential,
          app,
          model: selectedModel || undefined,
          models: modelIds.length > 0 ? modelIds : undefined,
          notes: notes.trim() || undefined,
          name: providerName,
          homepage,
          endpoint: baseUrl,
          apiFormat: apiFormat === AUTOMATIC_API_FORMAT ? undefined : apiFormat,
        })

        if (opened) {
          tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success)
          handleClose()
        } else {
          tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure)
        }
      } catch (error) {
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        })
        logger.warn("Failed to resolve token for AI Toolbox export", error)
        toast.error(
          t("messages:errors.operation.failed", {
            error: getErrorMessage(error),
          }),
        )
      } finally {
        setIsSubmitting(false)
      }
    })()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      panelTestId={AI_TOOLBOX_EXPORT_TEST_IDS.dialog}
      header={
        <div>
          <div className="text-foreground text-base font-semibold">
            {t("ui:dialog.aiToolbox.title")}
          </div>
          <p className="dark:text-secondary-foreground text-muted-foreground text-sm">
            {t("ui:dialog.aiToolbox.description")}
          </p>
        </div>
      }
      footer={
        <ActionGroup>
          <Button
            variant="ghost"
            type="button"
            data-testid={AI_TOOLBOX_EXPORT_TEST_IDS.cancelButton}
            onClick={handleClose}
          >
            {t("common:actions.cancel")}
          </Button>
          <Button
            type="submit"
            form={formId}
            disabled={isSubmitting}
            data-testid={AI_TOOLBOX_EXPORT_TEST_IDS.exportButton}
          >
            {t("ui:dialog.aiToolbox.actions.export")}
          </Button>
        </ActionGroup>
      }
    >
      <form className="space-y-density-4" id={formId} onSubmit={handleSubmit}>
        <div>
          <Label htmlFor="ai-toolbox-app">
            {t("ui:dialog.aiToolbox.fields.app")}
          </Label>
          <Select
            value={app ?? ""}
            onValueChange={(value) => setApp(value as AiToolboxApp)}
          >
            <SelectTrigger id="ai-toolbox-app" className="mt-density-1">
              <SelectValue placeholder={t("ui:dialog.aiToolbox.fields.app")} />
            </SelectTrigger>
            <SelectContent>
              {AI_TOOLBOX_APPS.map((value) => (
                <SelectItem key={value} value={value}>
                  {getAiToolboxAppLabel(t, value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="ai-toolbox-name">
            {t("ui:dialog.aiToolbox.fields.name")}
          </Label>
          <Input
            id="ai-toolbox-name"
            value={providerName}
            className="mt-density-1"
            placeholder={t("ui:dialog.aiToolbox.placeholders.name")}
            onChange={(event) => setProviderName(event.target.value)}
          />
        </div>

        <div>
          <Label htmlFor="ai-toolbox-homepage">
            {t("ui:dialog.aiToolbox.fields.homepage")}
          </Label>
          <Input
            id="ai-toolbox-homepage"
            value={homepage}
            className="mt-density-1"
            placeholder={t("ui:dialog.aiToolbox.placeholders.homepage")}
            onChange={(event) => setHomepage(event.target.value)}
          />
        </div>

        <div>
          <Label htmlFor="ai-toolbox-base-url">
            {t("ui:dialog.aiToolbox.fields.baseUrl")}
          </Label>
          <Input
            id="ai-toolbox-base-url"
            value={baseUrl}
            className="mt-density-1"
            placeholder={t("ui:dialog.aiToolbox.placeholders.baseUrl")}
            onChange={(event) => setBaseUrl(event.target.value)}
          />
        </div>

        <div>
          <Label htmlFor="ai-toolbox-api-format">
            {t("ui:dialog.aiToolbox.fields.apiFormat")}
          </Label>
          <Select
            value={apiFormat}
            onValueChange={(value) => setApiFormat(value as ApiFormatOption)}
          >
            <SelectTrigger id="ai-toolbox-api-format" className="mt-density-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {API_FORMAT_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {getApiFormatLabel(t, option)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="dark:text-secondary-foreground text-muted-foreground mt-density-1 text-xs">
            {t("ui:dialog.aiToolbox.descriptions.apiFormat")}
          </p>
        </div>

        <div>
          <Label htmlFor="ai-toolbox-model">
            {t("ui:dialog.aiToolbox.fields.model")}
          </Label>
          <SearchableSelect
            id="ai-toolbox-model"
            className="mt-density-1"
            value={model}
            onChange={setModel}
            placeholder={
              isLoadingModels
                ? t("common:status.loading")
                : t("ui:dialog.aiToolbox.placeholders.model")
            }
            options={[
              {
                value: "",
                label: t("ui:dialog.aiToolbox.modelOptions.none"),
              },
              ...upstreamModelOptions,
            ]}
            allowCustomValue
            disabled={isLoadingModels}
            data-testid={AI_TOOLBOX_EXPORT_TEST_IDS.modelPicker}
            searchInputTestId={AI_TOOLBOX_EXPORT_TEST_IDS.modelSearchInput}
          />
          <p className="dark:text-secondary-foreground text-muted-foreground mt-density-1 text-xs">
            {isModelDiscoveryFailed
              ? t("ui:dialog.aiToolbox.descriptions.modelDiscoveryFailed")
              : t("ui:dialog.aiToolbox.descriptions.model")}
          </p>
          {isModelDiscoveryFailed ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="mt-density-2"
              onClick={() => void loadModels(source.id)}
            >
              {t("common:actions.retry")}
            </Button>
          ) : null}
        </div>

        <div>
          <Label htmlFor="ai-toolbox-notes">
            {t("ui:dialog.aiToolbox.fields.notes")}
          </Label>
          <Input
            id="ai-toolbox-notes"
            value={notes}
            className="mt-density-1"
            placeholder={t("ui:dialog.aiToolbox.placeholders.notes")}
            onChange={(event) => setNotes(event.target.value)}
          />
        </div>
      </form>
    </Modal>
  )
}
