import { FormEvent, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { CCSwitchIcon } from "~/components/icons/CCSwitchIcon"
import {
  Button,
  Input,
  Label,
  Modal,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui"
import type { ApiToken, DisplaySiteData } from "~/types"
import {
  CCSWITCH_APPS,
  openInCCSwitch,
  type CCSwitchApp,
} from "~/utils/ccSwitch"

interface CCSwitchExportDialogProps {
  isOpen: boolean
  onClose: () => void
  account: DisplaySiteData
  token: ApiToken
}

const DEFAULT_APP: CCSwitchApp = "claude"

/**
 * Presents a modal for exporting an account token into CCSwitch-compatible apps.
 * Prefills provider metadata and lets the user tweak app, endpoint, model, and helper notes.
 * @param props Dialog state, selected account, and token details.
 */
export function CCSwitchExportDialog({
  isOpen,
  onClose,
  account,
  token,
}: CCSwitchExportDialogProps) {
  const { t } = useTranslation(["ui", "common"])
  const [app, setApp] = useState<CCSwitchApp>(DEFAULT_APP)
  const [model, setModel] = useState("")
  const [notes, setNotes] = useState("")
  const [providerName, setProviderName] = useState(account.name)
  const [homepage, setHomepage] = useState(account.baseUrl)
  const [endpoint, setEndpoint] = useState(account.baseUrl)
  const formId = useMemo(() => `ccswitch-export-form-${token.id}`, [token.id])

  useEffect(() => {
    if (isOpen) {
      setApp(DEFAULT_APP)
      setModel("")
      setNotes("")
      setProviderName(account.name)
      setHomepage(account.baseUrl)
      setEndpoint(account.baseUrl)
    }
  }, [account.name, account.baseUrl, isOpen])

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const success = openInCCSwitch({
      account,
      token,
      app,
      model: model.trim() || undefined,
      notes: notes.trim() || undefined,
      name: providerName,
      homepage,
      endpoint,
    })

    if (success) {
      onClose()
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      header={
        <div className="flex items-center gap-2">
          <CCSwitchIcon size="lg" />
          <div>
            <div className="dark:text-dark-text-primary text-base font-semibold text-gray-900">
              {t("ui:dialog.ccswitch.title")}
            </div>
            <p className="dark:text-dark-text-secondary text-sm text-gray-500">
              {t("ui:dialog.ccswitch.description")}
            </p>
          </div>
        </div>
      }
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" type="button" onClick={onClose}>
            {t("common:actions.cancel")}
          </Button>
          <Button type="submit" form={formId}>
            {t("ui:dialog.ccswitch.actions.export")}
          </Button>
        </div>
      }
    >
      <form className="space-y-4" id={formId} onSubmit={handleSubmit}>
        <div>
          <Label htmlFor="ccswitch-name">
            {t("ui:dialog.ccswitch.fields.name")}
          </Label>
          <Input
            id="ccswitch-name"
            value={providerName}
            className="mt-1"
            placeholder={t("ui:dialog.ccswitch.placeholders.name")}
            onChange={(event) => setProviderName(event.target.value)}
          />
        </div>

        <div>
          <Label htmlFor="ccswitch-homepage">
            {t("ui:dialog.ccswitch.fields.homepage")}
          </Label>
          <Input
            id="ccswitch-homepage"
            value={homepage}
            className="mt-1"
            placeholder={t("ui:dialog.ccswitch.placeholders.homepage")}
            onChange={(event) => setHomepage(event.target.value)}
          />
        </div>

        <div>
          <Label htmlFor="ccswitch-endpoint">
            {t("ui:dialog.ccswitch.fields.endpoint")}
          </Label>
          <Input
            id="ccswitch-endpoint"
            value={endpoint}
            className="mt-1"
            placeholder={t("ui:dialog.ccswitch.placeholders.endpoint")}
            onChange={(event) => setEndpoint(event.target.value)}
          />
        </div>

        <div>
          <Label htmlFor="ccswitch-app">
            {t("ui:dialog.ccswitch.fields.app")}
          </Label>
          <Select
            value={app ?? ""}
            onValueChange={(value) => setApp(value as CCSwitchApp)}
          >
            <SelectTrigger id="ccswitch-app" className="mt-1">
              <SelectValue placeholder={t("ui:dialog.ccswitch.fields.app")} />
            </SelectTrigger>
            <SelectContent>
              {CCSWITCH_APPS.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`ui:dialog.ccswitch.appOptions.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="ccswitch-model">
            {t("ui:dialog.ccswitch.fields.model")}
          </Label>
          <Input
            id="ccswitch-model"
            value={model}
            className="mt-1"
            placeholder={t("ui:dialog.ccswitch.placeholders.model")}
            onChange={(event) => setModel(event.target.value)}
          />
        </div>

        <div>
          <Label htmlFor="ccswitch-notes">
            {t("ui:dialog.ccswitch.fields.notes")}
          </Label>
          <Input
            id="ccswitch-notes"
            value={notes}
            className="mt-1"
            placeholder={t("ui:dialog.ccswitch.placeholders.notes")}
            onChange={(event) => setNotes(event.target.value)}
          />
        </div>
      </form>
    </Modal>
  )
}
