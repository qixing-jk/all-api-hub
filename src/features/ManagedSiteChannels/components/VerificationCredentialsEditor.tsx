import { EyeIcon, EyeSlashIcon } from "@heroicons/react/24/outline"
import { Pencil, Trash2 } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { Button, IconButton, Input, Label } from "~/components/ui"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import { API_TYPES } from "~/services/verification/aiApiVerification/types"
import type { VerificationCredentials } from "~/types/channelConfig"

interface VerificationCredentialsEditorProps {
  credentials?: VerificationCredentials
  onSave: (credentials: VerificationCredentials) => Promise<void>
  onClear: () => Promise<void>
  isSaving?: boolean
}

export default function VerificationCredentialsEditor({
  credentials,
  onSave,
  onClear,
  isSaving,
}: VerificationCredentialsEditorProps) {
  const { t } = useTranslation("managedSiteChannels")
  const [isEditing, setIsEditing] = useState(!credentials)
  const [showApiKey, setShowApiKey] = useState(false)

  const [baseUrl, setBaseUrl] = useState(credentials?.baseUrl ?? "")
  const [apiKey, setApiKey] = useState(credentials?.apiKey ?? "")
  const [apiType, setApiType] = useState(credentials?.apiType ?? "")

  const handleSave = async () => {
    if (!baseUrl.trim()) {
      return
    }
    if (!apiKey.trim()) {
      return
    }
    if (!apiType.trim()) {
      return
    }

    await onSave({
      baseUrl: baseUrl.trim(),
      apiKey: apiKey.trim(),
      apiType: apiType.trim(),
      sourceProfileId: credentials?.sourceProfileId,
      updatedAt: Date.now(),
    })

    setIsEditing(false)
  }

  const handleCancel = () => {
    if (credentials) {
      setBaseUrl(credentials.baseUrl)
      setApiKey(credentials.apiKey)
      setApiType(credentials.apiType)
      setIsEditing(false)
    } else {
      setBaseUrl("")
      setApiKey("")
      setApiType("")
    }
  }

  const handleClear = async () => {
    await onClear()
    setBaseUrl("")
    setApiKey("")
    setApiType("")
    setIsEditing(true)
  }

  if (!isEditing && credentials) {
    return (
      <div className="border-border space-y-3 rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold">
            {t("filters.verificationCredentials.title")}
          </h4>
          <div className="flex gap-2">
            <IconButton
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setIsEditing(true)}
              aria-label={t("filters.verificationCredentials.actions.edit")}
            >
              <Pencil className="h-4 w-4" />
            </IconButton>
            <IconButton
              type="button"
              size="sm"
              variant="ghost"
              onClick={handleClear}
              disabled={isSaving}
              aria-label={t("filters.verificationCredentials.actions.clear")}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </IconButton>
          </div>
        </div>

        <div className="space-y-2 text-sm">
          <div>
            <span className="text-muted-foreground">
              {t("filters.verificationCredentials.labels.baseUrl")}:{" "}
            </span>
            <span className="font-mono">{credentials.baseUrl}</span>
          </div>
          <div>
            <span className="text-muted-foreground">
              {t("filters.verificationCredentials.labels.apiKey")}:{" "}
            </span>
            <span className="font-mono">{"*".repeat(20)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">
              {t("filters.verificationCredentials.labels.apiType")}:{" "}
            </span>
            <span>{credentials.apiType}</span>
          </div>
          {credentials.sourceProfileId && (
            <div className="text-muted-foreground text-xs">
              {t("filters.verificationCredentials.sourceProfileLabel", {
                name: credentials.sourceProfileId,
              })}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="border-border space-y-4 rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">
          {t("filters.verificationCredentials.title")}
        </h4>
      </div>

      <p className="text-muted-foreground text-xs">
        {t("filters.verificationCredentials.description")}
      </p>

      <div className="space-y-3">
        <div className="space-y-2">
          <Label>{t("filters.verificationCredentials.labels.baseUrl")}</Label>
          <Input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder={t("filters.verificationCredentials.placeholders.baseUrl")}
            disabled={isSaving}
          />
        </div>

        <div className="space-y-2">
          <Label>{t("filters.verificationCredentials.labels.apiKey")}</Label>
          <div className="relative">
            <Input
              type={showApiKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={t(
                "filters.verificationCredentials.placeholders.apiKey",
              )}
              disabled={isSaving}
              className="pr-10"
            />
            <div className="absolute right-0 top-0 flex h-full items-center pr-2">
              <IconButton
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setShowApiKey(!showApiKey)}
                aria-label={showApiKey ? "Hide API key" : "Show API key"}
              >
                {showApiKey ? (
                  <EyeSlashIcon className="h-4 w-4" />
                ) : (
                  <EyeIcon className="h-4 w-4" />
                )}
              </IconButton>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label>{t("filters.verificationCredentials.labels.apiType")}</Label>
          <Select
            value={apiType}
            onValueChange={setApiType}
            disabled={isSaving}
          >
            <SelectTrigger>
              <SelectValue
                placeholder={t(
                  "filters.verificationCredentials.placeholders.apiType",
                )}
              />
            </SelectTrigger>
            <SelectContent>
              {Object.values(API_TYPES).map((type) => (
                <SelectItem key={type} value={type}>
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        {credentials && (
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            disabled={isSaving}
          >
            {t("filters.verificationCredentials.actions.cancel")}
          </Button>
        )}
        <Button
          type="button"
          onClick={handleSave}
          disabled={
            isSaving || !baseUrl.trim() || !apiKey.trim() || !apiType.trim()
          }
          loading={isSaving}
        >
          {t("filters.verificationCredentials.actions.save")}
        </Button>
      </div>
    </div>
  )
}
