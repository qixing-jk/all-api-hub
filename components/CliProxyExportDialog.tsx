import { FormEvent, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { CliProxyIcon } from "~/components/icons/CliProxyIcon"
import { Button, FormField, Input, Modal } from "~/components/ui"
import { importToCliProxy } from "~/services/cliProxyService"
import type { ApiToken, DisplaySiteData } from "~/types"
import { showResultToast } from "~/utils/toastHelpers"
import { joinUrl } from "~/utils/url"

interface CliProxyExportDialogProps {
  isOpen: boolean
  onClose: () => void
  account: DisplaySiteData
  token: ApiToken
}

/**
 * Build the OpenAI-compatible upstream base URL for CLI Proxy providers.
 */
function buildProviderBaseUrl(baseUrl: string) {
  return joinUrl(baseUrl, "/v1")
}

/**
 * Modal dialog for exporting a token to CLIProxyAPI.
 * Allows tweaking provider name, base URL, and optional proxy URL.
 */
export function CliProxyExportDialog(props: CliProxyExportDialogProps) {
  const { isOpen, onClose, account, token } = props
  const { t } = useTranslation(["ui", "common"])

  const [providerName, setProviderName] = useState("")
  const [providerBaseUrl, setProviderBaseUrl] = useState("")
  const [proxyUrl, setProxyUrl] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const formId = useMemo(() => `cliproxy-export-form-${token.id}`, [token.id])

  useEffect(() => {
    if (!isOpen) return
    setProviderName(account.name || account.baseUrl)
    setProviderBaseUrl(buildProviderBaseUrl(account.baseUrl))
    setProxyUrl("")
  }, [account.baseUrl, account.name, isOpen])

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    void (async () => {
      try {
        setIsSubmitting(true)
        const result = await importToCliProxy({
          account,
          token,
          providerName: providerName.trim(),
          providerBaseUrl:
            providerBaseUrl.trim() || buildProviderBaseUrl(account.baseUrl),
          proxyUrl: proxyUrl.trim(),
        })
        showResultToast(result)
        if (result.success) {
          onClose()
        }
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
        <FormField label={t("ui:dialog.cliproxy.fields.name")}>
          <Input
            value={providerName}
            onChange={(event) => setProviderName(event.target.value)}
            placeholder={t("ui:dialog.cliproxy.placeholders.name")}
          />
        </FormField>

        <FormField
          label={t("ui:dialog.cliproxy.fields.baseUrl")}
          description={t("ui:dialog.cliproxy.descriptions.baseUrl")}
        >
          <Input
            value={providerBaseUrl}
            onChange={(event) => setProviderBaseUrl(event.target.value)}
            placeholder={t("ui:dialog.cliproxy.placeholders.baseUrl")}
          />
        </FormField>

        <FormField
          label={t("ui:dialog.cliproxy.fields.proxyUrl")}
          description={t("ui:dialog.cliproxy.descriptions.proxyUrl")}
        >
          <Input
            value={proxyUrl}
            onChange={(event) => setProxyUrl(event.target.value)}
            placeholder={t("ui:dialog.cliproxy.placeholders.proxyUrl")}
          />
        </FormField>
      </form>
    </Modal>
  )
}
