import { QRCodeSVG } from "qrcode.react"
import { useEffect, useId, useMemo, useState, type FormEvent } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import {
  Alert,
  Button,
  FormField,
  Input,
  Modal,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui"
import { useSafeExportAction } from "~/hooks/useSafeExportAction"
import {
  buildKelivoProviderShareCode,
  copyKelivoProviderShareCode,
  createKelivoProviderExportDraft,
  isValidKelivoBaseUrl,
  KELIVO_GOOGLE_BASE_URL,
  type KelivoProviderExportInput,
} from "~/services/integrations/kelivo"
import {
  startProductAnalyticsAction,
  type ProductAnalyticsActionContext,
} from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_RESULTS,
} from "~/services/productAnalytics/contracts"
import {
  API_TYPES,
  type ApiVerificationApiType,
} from "~/services/verification/aiApiVerification"

interface KelivoExportDialogProps {
  isOpen: boolean
  onClose: () => void
  initialValue: KelivoProviderExportInput
  analyticsContext: ProductAnalyticsActionContext
}

const KELIVO_API_TYPE_OPTIONS = [
  API_TYPES.OPENAI_COMPATIBLE,
  API_TYPES.ANTHROPIC,
  API_TYPES.GOOGLE,
] as const

type KelivoApiType = (typeof KELIVO_API_TYPE_OPTIONS)[number]

/** Return the supported Kelivo option represented by an app API type. */
function normalizeKelivoApiType(
  apiType: ApiVerificationApiType,
): KelivoApiType {
  return apiType === API_TYPES.OPENAI ? API_TYPES.OPENAI_COMPATIBLE : apiType
}

/**
 * Editable confirmation dialog for one Kelivo mobile provider import.
 *
 * Kelivo v1.2.1 exposes provider import only in its mobile provider page;
 * its desktop provider pane requires manual setup.
 * Mobile: https://github.com/Chevey339/kelivo/blob/2ff4ed9f3f860c0d8603ecaac19c51efadcb03bb/lib/features/provider/pages/providers_page.dart
 * Desktop: https://github.com/Chevey339/kelivo/blob/2ff4ed9f3f860c0d8603ecaac19c51efadcb03bb/lib/desktop/setting/providers_pane.dart
 */
export function KelivoExportDialog({
  isOpen,
  onClose,
  initialValue,
  analyticsContext,
}: KelivoExportDialogProps) {
  const { t } = useTranslation([
    "ui",
    "common",
    "messages",
    "apiCredentialProfiles",
    "aiApiVerification",
    "keyManagement",
  ])
  const generatedId = useId()
  const formId = `${generatedId}-kelivo-export-form`
  const nameInputId = `${generatedId}-kelivo-provider-name`
  const apiKeyInputId = `${generatedId}-kelivo-api-key`
  const baseUrlInputId = `${generatedId}-kelivo-base-url`
  const mobileQrCodeHeadingId = `${generatedId}-kelivo-mobile-qr-code-heading`
  const {
    apiKey: initialApiKey,
    apiType: initialApiType,
    baseUrl: initialBaseUrl,
    name: initialName,
  } = initialValue
  const defaultDraft = useMemo(
    () =>
      createKelivoProviderExportDraft({
        apiKey: initialApiKey,
        apiType: initialApiType,
        baseUrl: initialBaseUrl,
        name: initialName,
      }),
    [initialApiKey, initialApiType, initialBaseUrl, initialName],
  )
  const [apiType, setApiType] = useState<KelivoApiType>(() =>
    normalizeKelivoApiType(defaultDraft.apiType),
  )
  const [name, setName] = useState(defaultDraft.name)
  const [apiKey, setApiKey] = useState(defaultDraft.apiKey)
  const [baseUrl, setBaseUrl] = useState(defaultDraft.baseUrl)

  useEffect(() => {
    if (!isOpen) return
    setApiType(normalizeKelivoApiType(defaultDraft.apiType))
    setName(defaultDraft.name)
    setApiKey(defaultDraft.apiKey)
    setBaseUrl(defaultDraft.baseUrl)
  }, [defaultDraft, isOpen])

  const isGoogle = apiType === API_TYPES.GOOGLE
  const effectiveBaseUrl = isGoogle ? KELIVO_GOOGLE_BASE_URL : baseUrl
  const hasValidBaseUrl = isValidKelivoBaseUrl(effectiveBaseUrl)
  const canCopy =
    Boolean(name.trim()) && Boolean(apiKey.trim()) && hasValidBaseUrl
  const mobileImportCode = useMemo(() => {
    if (!canCopy) return null

    try {
      return buildKelivoProviderShareCode({
        apiType,
        name,
        apiKey,
        baseUrl: effectiveBaseUrl,
      })
    } catch {
      return null
    }
  }, [apiKey, apiType, canCopy, effectiveBaseUrl, name])
  const exportActionSignature = JSON.stringify({
    apiType,
    name: name.trim(),
    apiKey: apiKey.trim(),
    baseUrl: effectiveBaseUrl.trim(),
  })
  const {
    begin: beginExportAction,
    invalidate: invalidateExportAction,
    isRunning: isCopying,
  } = useSafeExportAction({
    isOpen,
    signature: exportActionSignature,
  })

  const handleClose = () => {
    invalidateExportAction()
    onClose()
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canCopy) return
    const action = beginExportAction()
    if (!action) return

    const tracker = startProductAnalyticsAction(analyticsContext)
    try {
      const success = await copyKelivoProviderShareCode({
        apiType,
        name,
        apiKey,
        baseUrl: effectiveBaseUrl,
      })
      if (!action.isCurrent()) return

      if (success) {
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success)
      } else {
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        })
      }
    } catch {
      if (!action.isCurrent()) return
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      })
      toast.error(t("messages:kelivo.copyFailed"))
    } finally {
      action.finish()
    }
  }

  const getApiTypeLabel = (option: KelivoApiType) => {
    switch (option) {
      case API_TYPES.OPENAI_COMPATIBLE:
        return t("aiApiVerification:verifyDialog.apiTypes.openaiCompatible")
      case API_TYPES.ANTHROPIC:
        return t("aiApiVerification:verifyDialog.apiTypes.anthropic")
      case API_TYPES.GOOGLE:
        return t("aiApiVerification:verifyDialog.apiTypes.google")
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      size="md"
      header={
        <div className="pr-8">
          <div className="dark:text-dark-text-primary text-base font-semibold text-gray-900">
            {t("ui:dialog.kelivo.title")}
          </div>
          <p className="dark:text-dark-text-secondary text-sm text-gray-500">
            {t("ui:dialog.kelivo.description")}
          </p>
        </div>
      }
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={handleClose}>
            {t("common:actions.cancel")}
          </Button>
          <Button
            type="submit"
            form={formId}
            disabled={!canCopy || isCopying}
            loading={isCopying}
          >
            {t("ui:dialog.kelivo.actions.copy")}
          </Button>
        </div>
      }
    >
      <form id={formId} className="space-y-4" onSubmit={handleSubmit}>
        <FormField
          label={t("aiApiVerification:verifyDialog.meta.apiType")}
          required
          description={t("ui:dialog.kelivo.protocolDescription")}
        >
          <Select
            value={apiType}
            onValueChange={(value) => {
              const option = KELIVO_API_TYPE_OPTIONS.find(
                (candidate) => candidate === value,
              )
              if (option) setApiType(option)
            }}
          >
            <SelectTrigger
              aria-label={t("aiApiVerification:verifyDialog.meta.apiType")}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KELIVO_API_TYPE_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {getApiTypeLabel(option)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        <FormField
          htmlFor={nameInputId}
          label={t("apiCredentialProfiles:dialog.fields.name")}
          required
        >
          <Input
            id={nameInputId}
            value={name}
            disabled={isCopying}
            onChange={(event) => setName(event.target.value)}
          />
        </FormField>

        <FormField
          htmlFor={apiKeyInputId}
          label={t("apiCredentialProfiles:dialog.fields.apiKey")}
          required
        >
          <Input
            id={apiKeyInputId}
            type="password"
            revealable
            revealLabels={{
              show: t("keyManagement:actions.showKey"),
              hide: t("keyManagement:actions.hideKey"),
            }}
            value={apiKey}
            disabled={isCopying}
            autoComplete="off"
            onChange={(event) => setApiKey(event.target.value)}
          />
        </FormField>

        <FormField
          htmlFor={baseUrlInputId}
          label={t("apiCredentialProfiles:dialog.fields.baseUrl")}
          required
          description={
            isGoogle
              ? t("ui:dialog.kelivo.googleBaseUrlDescription")
              : t("ui:dialog.kelivo.baseUrlDescription")
          }
          error={
            hasValidBaseUrl ? undefined : t("messages:kelivo.invalidBaseUrl")
          }
        >
          <Input
            id={baseUrlInputId}
            value={effectiveBaseUrl}
            disabled={isGoogle || isCopying}
            aria-invalid={!hasValidBaseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
          />
        </FormField>

        {isGoogle ? (
          <Alert
            variant="info"
            title={t("ui:dialog.kelivo.googleNotice.title")}
            description={t("ui:dialog.kelivo.googleNotice.description")}
          />
        ) : null}

        {mobileImportCode ? (
          <section
            aria-labelledby={mobileQrCodeHeadingId}
            className="dark:border-dark-bg-tertiary rounded-lg border border-gray-200 bg-gray-50 p-4 dark:bg-gray-900/30"
          >
            <h3
              id={mobileQrCodeHeadingId}
              className="dark:text-dark-text-primary text-sm font-semibold text-gray-900"
            >
              {t("ui:dialog.kelivo.mobileQrCode.title")}
            </h3>
            <p className="dark:text-dark-text-secondary mt-1 text-xs text-gray-500">
              {t("ui:dialog.kelivo.mobileQrCode.description")}
            </p>
            <div className="mt-3 flex justify-center overflow-hidden rounded-lg bg-white p-3">
              <QRCodeSVG
                value={mobileImportCode}
                size={196}
                level="M"
                marginSize={4}
                role="img"
                title={t("ui:dialog.kelivo.mobileQrCodeLabel")}
              />
            </div>
          </section>
        ) : null}

        <Alert
          variant="info"
          title={t("ui:dialog.kelivo.desktopNotice.title")}
          description={t("ui:dialog.kelivo.desktopNotice.description")}
        />

        <Alert
          variant="warning"
          title={t("ui:dialog.kelivo.securityNotice.title")}
          description={t("ui:dialog.kelivo.securityNotice.description")}
        />
      </form>
    </Modal>
  )
}
