import { FormEvent, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  Button,
  Checkbox,
  FormField,
  Input,
  Modal,
  MultiSelect,
} from "~/components/ui"
import { fetchUpstreamModels } from "~/services/apiService"
import { importToClaudeCodeRouter } from "~/services/claudeCodeRouterService"
import type { ApiToken, DisplaySiteData } from "~/types"
import { showResultToast } from "~/utils/toastHelpers"

interface ClaudeCodeRouterImportDialogProps {
  isOpen: boolean
  onClose: () => void
  account: DisplaySiteData
  token: ApiToken
  routerBaseUrl: string
  routerApiKey?: string
}

/**
 * Build the default Claude Code Router `api_base_url` for a provider.
 * Claude Code Router expects a full OpenAI-compatible endpoint (typically ending in
 * `/v1/chat/completions`).
 */
function buildDefaultProviderApiBaseUrlFromBaseUrl(baseUrl: string) {
  const raw = (baseUrl || "").trim()
  if (!raw) return ""
  if (raw.includes("/v1/chat/completions")) return raw
  return raw.replace(/\/+$/, "") + "/v1/chat/completions"
}

/**
 * Derive an upstream base URL (used for `/v1/models`) from a provider API base URL.
 *
 * Example:
 * - https://example.com/v1/chat/completions -> https://example.com
 * - https://example.com/openai/v1/chat/completions -> https://example.com/openai
 */
function buildUpstreamBaseUrlFromProviderApiBaseUrl(
  providerApiBaseUrl: string,
) {
  const raw = (providerApiBaseUrl || "").trim()
  if (!raw) return ""
  return raw.replace(/\/v1\/chat\/completions\/?$/, "")
}

/**
 * Modal dialog for importing a token into Claude Code Router.
 *
 * The dialog collects provider name, provider endpoint (`api_base_url`) and models,
 * then writes the provider into Claude Code Router via `POST /api/config`.
 */
export function ClaudeCodeRouterImportDialog(
  props: ClaudeCodeRouterImportDialogProps,
) {
  const { isOpen, onClose, account, token, routerBaseUrl, routerApiKey } = props

  const { t } = useTranslation(["ui", "common"])

  const [providerName, setProviderName] = useState("")
  const [providerApiBaseUrl, setProviderApiBaseUrl] = useState("")
  const [restartAfterSave, setRestartAfterSave] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const formId = useMemo(
    () => `claude-code-router-import-form-${token.id}`,
    [token.id],
  )

  useEffect(() => {
    if (!isOpen) return
    setProviderName(account.name || account.baseUrl)
    setProviderApiBaseUrl(
      buildDefaultProviderApiBaseUrlFromBaseUrl(account.baseUrl),
    )
    setRestartAfterSave(true)
  }, [isOpen, account.name, account.baseUrl])

  const [selectedModels, setSelectedModels] = useState<string[]>([])

  const [upstreamModelOptions, setUpstreamModelOptions] = useState<
    { value: string; label: string }[]
  >([])
  const [isLoadingModels, setIsLoadingModels] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setSelectedModels([])
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return

    const upstreamBaseUrl =
      buildUpstreamBaseUrlFromProviderApiBaseUrl(providerApiBaseUrl)
    if (!upstreamBaseUrl) {
      setUpstreamModelOptions([])
      return
    }

    let isMounted = true
    const handle = setTimeout(() => {
      void (async () => {
        try {
          setIsLoadingModels(true)
          const models = await fetchUpstreamModels({
            baseUrl: upstreamBaseUrl,
            apiKey: token.key,
          })
          const options = (models || [])
            .map((item) => item?.id)
            .filter(
              (id): id is string => typeof id === "string" && id.length > 0,
            )
            .sort((a, b) => a.localeCompare(b))
            .map((id) => ({ value: id, label: id }))

          if (isMounted) {
            setUpstreamModelOptions(options)
          }
        } catch (error) {
          console.error(
            "[ClaudeCodeRouter] Failed to fetch upstream models",
            error,
          )
          if (isMounted) {
            setUpstreamModelOptions([])
          }
        } finally {
          if (isMounted) {
            setIsLoadingModels(false)
          }
        }
      })()
    }, 300)

    return () => {
      isMounted = false
      clearTimeout(handle)
    }
  }, [isOpen, providerApiBaseUrl, token.key])

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const providerModels = selectedModels

    void (async () => {
      try {
        setIsSubmitting(true)
        const result = await importToClaudeCodeRouter({
          account,
          token,
          routerBaseUrl,
          routerApiKey,
          providerName: providerName.trim(),
          providerApiBaseUrl: providerApiBaseUrl.trim(),
          providerModels,
          restartAfterSave,
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
      size="lg"
      header={
        <div className="pr-8">
          <div className="dark:text-dark-text-primary text-base font-semibold text-gray-900">
            {t("ui:dialog.claudeCodeRouter.title")}
          </div>
          <p className="dark:text-dark-text-secondary text-sm text-gray-500">
            {t("ui:dialog.claudeCodeRouter.description")}
          </p>
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
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField
            label={t("ui:dialog.claudeCodeRouter.fields.providerName")}
          >
            <Input
              value={providerName}
              onChange={(e) => setProviderName(e.target.value)}
              placeholder={t(
                "ui:dialog.claudeCodeRouter.placeholders.providerName",
              )}
            />
          </FormField>

          <FormField
            label={t("ui:dialog.claudeCodeRouter.fields.providerApiBaseUrl")}
            description={t(
              "ui:dialog.claudeCodeRouter.descriptions.providerApiBaseUrl",
            )}
          >
            <Input
              value={providerApiBaseUrl}
              onChange={(e) => setProviderApiBaseUrl(e.target.value)}
              placeholder={t(
                "ui:dialog.claudeCodeRouter.placeholders.providerApiBaseUrl",
              )}
            />
          </FormField>
        </div>

        <FormField
          label={t("ui:dialog.claudeCodeRouter.fields.models")}
          description={t("ui:dialog.claudeCodeRouter.descriptions.models")}
        >
          <MultiSelect
            options={upstreamModelOptions}
            selected={selectedModels}
            onChange={setSelectedModels}
            placeholder={
              isLoadingModels
                ? t("common:status.loading")
                : t("ui:dialog.claudeCodeRouter.placeholders.modelsPicker")
            }
            disabled={isLoadingModels}
            allowCustom
            parseCommaStrings
            clearable
          />
        </FormField>

        <div className="flex items-start gap-3">
          <Checkbox
            checked={restartAfterSave}
            onCheckedChange={(checked) => setRestartAfterSave(!!checked)}
          />
          <div className="space-y-1">
            <div className="dark:text-dark-text-primary text-sm font-medium text-gray-900">
              {t("ui:dialog.claudeCodeRouter.fields.restartAfterSave")}
            </div>
            <p className="dark:text-dark-text-secondary text-xs text-gray-500">
              {t("ui:dialog.claudeCodeRouter.descriptions.restartAfterSave")}
            </p>
          </div>
        </div>
      </form>
    </Modal>
  )
}
