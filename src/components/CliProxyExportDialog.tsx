import { FormEvent, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { CliProxyIcon } from "~/components/icons/CliProxyIcon"
import {
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
import { resolveDisplayAccountTokenForSecret } from "~/services/accounts/utils/apiServiceRequest"
import { fetchAnthropicModelIds } from "~/services/apiService/anthropic"
import { fetchGoogleModelIds } from "~/services/apiService/google"
import { fetchOpenAICompatibleModelIds } from "~/services/apiService/openaiCompatible"
import {
  buildDefaultCliProxyProviderBaseUrl,
  CLI_PROXY_PROVIDER_METADATA,
  CLI_PROXY_PROVIDER_TYPES,
  mapApiTypeHintToCliProxyProviderType,
  normalizeCliProxyProviderBaseUrl,
  type CliProxyProviderType,
} from "~/services/integrations/cliProxyProviderTypes"
import {
  importToCliProxy,
  type ImportToCliProxyOptions,
} from "~/services/integrations/cliProxyService"
import type { ApiVerificationApiType } from "~/services/verification/aiApiVerification"
import { normalizeOpenAiFamilyBaseUrl } from "~/services/verification/webAiApiCheck/extractCredentials"
import type { ApiToken, DisplaySiteData } from "~/types"
import { safeRandomUUID } from "~/utils/core/identifier"
import { createLogger } from "~/utils/core/logger"
import { showResultToast } from "~/utils/core/toastHelpers"

interface CliProxyExportDialogProps {
  isOpen: boolean
  onClose: () => void
  account: DisplaySiteData
  token: ApiToken
  apiTypeHint?: ApiVerificationApiType
}

const logger = createLogger("CliProxyExportDialog")

/**
 * builds a provider name to pre-fill the form field. For some provider types, the name is not used and can be left empty, so we fall back to baseUrl to at least provide some context to the user.
 */
function buildProviderName(accountName: string, accountBaseUrl: string) {
  return accountName || accountBaseUrl
}

/**
 * builds a default base URL to pre-fill the form field based on the provider type and account base URL. For some provider types, there is no default base URL, so we return an empty string.
 */
function normalizeSuggestedModelIds(modelIds: string[]) {
  return modelIds
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
}

/**
 * normalizes the base URL for model suggestions based on the provider type. This is needed because some providers have specific requirements for the base URL when fetching model suggestions, which may differ from the base URL used for the actual CLI proxy configuration.
 */
function resolveModelSuggestionsBaseUrl(
  providerType: CliProxyProviderType,
  baseUrl: string,
) {
  if (providerType === CLI_PROXY_PROVIDER_TYPES.GEMINI_API_KEY) {
    return (
      normalizeCliProxyProviderBaseUrl(providerType, baseUrl) || baseUrl.trim()
    )
  }

  return normalizeOpenAiFamilyBaseUrl(baseUrl) ?? baseUrl.trim()
}

/**
 * fetches the list of available model IDs from the upstream provider based on the provider type, base URL, and API key. This is used to provide suggestions to the user when filling out the models field in the form. If fetching fails for any reason (e.g. network error, invalid credentials, etc.), we catch the error and return an empty list, allowing the user to manually enter model IDs without suggestions.
 */
async function fetchProviderModelSuggestions(options: {
  providerType: CliProxyProviderType
  baseUrl: string
  apiKey: string
}) {
  const { providerType, baseUrl, apiKey } = options
  const normalizedBaseUrl = resolveModelSuggestionsBaseUrl(
    providerType,
    baseUrl,
  )

  if (!normalizedBaseUrl) return []

  switch (providerType) {
    case CLI_PROXY_PROVIDER_TYPES.CLAUDE_API_KEY:
      return fetchAnthropicModelIds({
        baseUrl: normalizedBaseUrl,
        apiKey,
      })
    case CLI_PROXY_PROVIDER_TYPES.GEMINI_API_KEY:
      return fetchGoogleModelIds({
        baseUrl: normalizedBaseUrl,
        apiKey,
      })
    case CLI_PROXY_PROVIDER_TYPES.CODEX_API_KEY:
    case CLI_PROXY_PROVIDER_TYPES.OPENAI_COMPATIBILITY:
    default:
      return fetchOpenAICompatibleModelIds({
        baseUrl: normalizedBaseUrl,
        apiKey,
      })
  }
}

/**
 * A dialog component that allows the user to export their account and API token configuration to a CLI proxy provider. The form fields are dynamically adjusted based on the selected provider type, and model suggestions are fetched from the upstream provider if supported. Upon submission, the configuration is sent to the backend to be imported into the CLI proxy, and a toast notification is shown with the result.
 */
export function CliProxyExportDialog(props: CliProxyExportDialogProps) {
  const { isOpen, onClose, account, token, apiTypeHint } = props
  const { t } = useTranslation(["ui", "common"])

  const defaultProviderType = useMemo(() => {
    return mapApiTypeHintToCliProxyProviderType(apiTypeHint)
  }, [apiTypeHint])

  const [providerType, setProviderType] =
    useState<CliProxyProviderType>(defaultProviderType)
  const [providerName, setProviderName] = useState("")
  const [providerBaseUrl, setProviderBaseUrl] = useState("")
  const [proxyUrl, setProxyUrl] = useState("")
  const [models, setModels] = useState<
    React.ComponentProps<typeof ModelListInput>["value"]
  >([])
  const [availableUpstreamModels, setAvailableUpstreamModels] = useState<
    string[]
  >([])
  const [hasEditedModels, setHasEditedModels] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const formResetKey = useMemo(() => {
    return [
      isOpen,
      token.id,
      account.id,
      account.baseUrl,
      account.name,
      defaultProviderType,
    ].join(":")
  }, [
    account.baseUrl,
    account.id,
    account.name,
    defaultProviderType,
    isOpen,
    token.id,
  ])
  const [readyFormKey, setReadyFormKey] = useState<string | null>(null)

  const formId = useMemo(() => `cliproxy-export-form-${token.id}`, [token.id])
  const providerTypeFieldId = useMemo(
    () => `cliproxy-provider-type-${token.id}`,
    [token.id],
  )
  const providerNameFieldId = useMemo(
    () => `cliproxy-provider-name-${token.id}`,
    [token.id],
  )
  const providerBaseUrlFieldId = useMemo(
    () => `cliproxy-provider-base-url-${token.id}`,
    [token.id],
  )
  const proxyUrlFieldId = useMemo(
    () => `cliproxy-provider-proxy-url-${token.id}`,
    [token.id],
  )
  const providerTypeMetadata = CLI_PROXY_PROVIDER_METADATA[providerType]
  const providerTypeDescription = `${t("ui:dialog.cliproxy.descriptions.providerType")} ${t(providerTypeMetadata.descriptionKey)}`
  const modelsDescriptionKey = providerTypeMetadata.supportsModelSuggestions
    ? "ui:dialog.cliproxy.descriptions.models"
    : "ui:dialog.cliproxy.descriptions.modelsManual"

  useEffect(() => {
    if (!isOpen) {
      setReadyFormKey(null)
      setHasEditedModels(false)
      return
    }

    setProviderType(defaultProviderType)
    setProviderName(buildProviderName(account.name, account.baseUrl))
    setProviderBaseUrl(
      buildDefaultCliProxyProviderBaseUrl(defaultProviderType, account.baseUrl),
    )
    setProxyUrl("")
    setAvailableUpstreamModels([])
    setHasEditedModels(false)
    setModels([
      {
        id: safeRandomUUID("model"),
        name: "",
        alias: "",
      },
    ])
    setReadyFormKey(formResetKey)
  }, [account.baseUrl, account.name, defaultProviderType, formResetKey, isOpen])

  useEffect(() => {
    if (
      !isOpen ||
      readyFormKey !== formResetKey ||
      !providerTypeMetadata.supportsModelSuggestions
    ) {
      setAvailableUpstreamModels([])
      return
    }

    let isActive = true
    setAvailableUpstreamModels([])

    void (async () => {
      try {
        const modelIds = await fetchProviderModelSuggestions({
          providerType,
          baseUrl: providerBaseUrl.trim() || account.baseUrl,
          apiKey: (await resolveDisplayAccountTokenForSecret(account, token))
            .key,
        })

        const normalized = normalizeSuggestedModelIds(modelIds)

        if (!isActive) return
        setAvailableUpstreamModels(normalized)
      } catch (error) {
        logger.warn("Failed to fetch upstream model list", error)
        if (!isActive) return
        setAvailableUpstreamModels([])
      }
    })()

    return () => {
      isActive = false
    }
  }, [
    isOpen,
    providerBaseUrl,
    providerType,
    providerTypeMetadata.supportsModelSuggestions,
    readyFormKey,
    formResetKey,
    account,
    token,
  ])

  const handleProviderTypeChange = (nextProviderType: string) => {
    const typedProviderType = nextProviderType as CliProxyProviderType
    const previousDefault = buildDefaultCliProxyProviderBaseUrl(
      providerType,
      account.baseUrl,
    )
    const nextDefault = buildDefaultCliProxyProviderBaseUrl(
      typedProviderType,
      account.baseUrl,
    )

    setProviderType(typedProviderType)
    setProviderBaseUrl((currentValue) => {
      const normalizedCurrentValue = normalizeCliProxyProviderBaseUrl(
        providerType,
        currentValue,
      )

      if (!currentValue.trim() || normalizedCurrentValue === previousDefault) {
        return nextDefault
      }

      return currentValue
    })
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    void (async () => {
      try {
        setIsSubmitting(true)
        const resolvedToken = await resolveDisplayAccountTokenForSecret(
          account,
          token,
        )

        const normalizedModels = models
          .map((item) => {
            const name = item.name.trim()
            const alias = item.alias.trim()
            return {
              name,
              alias: alias || undefined,
            }
          })
          .filter((item) => item.name.length > 0)

        const payload: ImportToCliProxyOptions = {
          account,
          token: resolvedToken,
          apiTypeHint,
          providerType,
          providerName: providerName.trim(),
          providerBaseUrl: providerBaseUrl.trim() || undefined,
          proxyUrl: proxyUrl.trim(),
          models: hasEditedModels ? normalizedModels : undefined,
        }

        const result = await importToCliProxy(payload)
        showResultToast(result)
        if (result.success) {
          onClose()
        }
      } catch (error) {
        showResultToast({
          success: false,
          message: t("messages:errors.operation.failed", {
            error: error instanceof Error ? error.message : String(error),
          }),
        })
      } finally {
        setIsSubmitting(false)
      }
    })()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      header={
        <div className="flex items-center gap-2">
          <CliProxyIcon size="lg" />
          <div>
            <div className="dark:text-dark-text-primary text-base font-semibold text-gray-900">
              {t("ui:dialog.cliproxy.title")}
            </div>
            <p className="dark:text-dark-text-secondary text-sm text-gray-500">
              {t("ui:dialog.cliproxy.description")}
            </p>
          </div>
        </div>
      }
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" type="button" onClick={onClose}>
            {t("common:actions.cancel")}
          </Button>
          <Button type="submit" form={formId} disabled={isSubmitting}>
            {t("common:actions.import")}
          </Button>
        </div>
      }
    >
      <form className="space-y-4" id={formId} onSubmit={handleSubmit}>
        <FormField
          label={t("ui:dialog.cliproxy.fields.providerType")}
          htmlFor={providerTypeFieldId}
          description={providerTypeDescription}
        >
          <Select value={providerType} onValueChange={handleProviderTypeChange}>
            <SelectTrigger
              id={providerTypeFieldId}
              aria-label={t("ui:dialog.cliproxy.fields.providerType")}
            >
              <SelectValue
                placeholder={t("ui:dialog.cliproxy.placeholders.providerType")}
              />
            </SelectTrigger>
            <SelectContent>
              {Object.values(CLI_PROXY_PROVIDER_TYPES).map((value) => {
                const metadata = CLI_PROXY_PROVIDER_METADATA[value]
                return (
                  <SelectItem key={value} value={value}>
                    {t(metadata.labelKey)}
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
        </FormField>

        {providerTypeMetadata.providerNameVisible ? (
          <FormField
            label={t("ui:dialog.cliproxy.fields.name")}
            htmlFor={providerNameFieldId}
          >
            <Input
              aria-label={t("ui:dialog.cliproxy.fields.name")}
              id={providerNameFieldId}
              value={providerName}
              onChange={(event) => setProviderName(event.target.value)}
              placeholder={t("ui:dialog.cliproxy.placeholders.name")}
            />
          </FormField>
        ) : null}

        <FormField
          label={t("ui:dialog.cliproxy.fields.baseUrl")}
          htmlFor={providerBaseUrlFieldId}
          required={providerTypeMetadata.baseUrlRequired}
          description={t(providerTypeMetadata.baseUrlDescriptionKey)}
        >
          <Input
            aria-label={t("ui:dialog.cliproxy.fields.baseUrl")}
            id={providerBaseUrlFieldId}
            value={providerBaseUrl}
            required={providerTypeMetadata.baseUrlRequired}
            onChange={(event) => setProviderBaseUrl(event.target.value)}
            placeholder={t(providerTypeMetadata.baseUrlPlaceholderKey)}
          />
        </FormField>

        <FormField
          label={t("ui:dialog.cliproxy.fields.proxyUrl")}
          htmlFor={proxyUrlFieldId}
          description={t("ui:dialog.cliproxy.descriptions.proxyUrl")}
        >
          <Input
            aria-label={t("ui:dialog.cliproxy.fields.proxyUrl")}
            id={proxyUrlFieldId}
            value={proxyUrl}
            onChange={(event) => setProxyUrl(event.target.value)}
            placeholder={t("ui:dialog.cliproxy.placeholders.proxyUrl")}
          />
        </FormField>

        <FormField
          label={t("ui:dialog.cliproxy.fields.models")}
          description={t(modelsDescriptionKey)}
        >
          <ModelListInput
            value={models}
            onChange={(nextModels) => {
              setHasEditedModels(true)
              setModels(nextModels)
            }}
            showHeader={false}
            nameSuggestions={
              providerTypeMetadata.supportsModelSuggestions
                ? availableUpstreamModels
                : []
            }
            strings={{
              addLabel: t("ui:dialog.cliproxy.actions.addModel"),
              removeLabel: t("ui:dialog.cliproxy.actions.removeModel"),
              dragHandleLabel: t("ui:dialog.cliproxy.actions.reorderModel"),
              namePlaceholder: t("ui:dialog.cliproxy.placeholders.modelName"),
              aliasPlaceholder: t("ui:dialog.cliproxy.placeholders.modelAlias"),
            }}
          />
        </FormField>
      </form>
    </Modal>
  )
}
