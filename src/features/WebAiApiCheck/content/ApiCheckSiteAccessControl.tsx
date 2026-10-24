import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button, Switch } from "~/components/ui"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import {
  sendWebAiApiCheckMessage,
  WebAiApiCheckMessageTypes,
} from "~/services/verification/webAiApiCheck/messaging"
import { sendRuntimeMessage } from "~/utils/browser/runtimeMessages"

/** Page-scoped control remains available from the manual panel on excluded sites. */
export function ApiCheckSiteAccessControl({ pageUrl }: { pageUrl: string }) {
  const { t } = useTranslation(["webAiApiCheck", "common"])
  const [allowed, setAllowed] = useState<boolean | null>(null)
  const [globallyEnabled, setGloballyEnabled] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(false)
  useEffect(() => {
    let active = true
    setAllowed(null)
    void sendWebAiApiCheckMessage(WebAiApiCheckMessageTypes.ShouldPrompt, {
      pageUrl,
    })
      .then((result) => {
        if (
          !active ||
          !result.success ||
          typeof result.siteAllowed !== "boolean"
        )
          return
        setAllowed(result.siteAllowed)
        setGloballyEnabled(result.autoDetectEnabled ?? true)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [pageUrl])
  if (allowed === null) return null
  return (
    <div className="border-border space-y-density-2 rounded-md border p-3 text-xs">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor="api-check-site-enabled">
          {t("webAiApiCheck:siteControl.label")}
        </label>
        <Switch
          id="api-check-site-enabled"
          checked={allowed}
          disabled={saving}
          aria-label={t("webAiApiCheck:siteControl.label")}
          onChange={async (enabled) => {
            setSaving(true)
            setError(false)
            try {
              const result = await sendWebAiApiCheckMessage(
                WebAiApiCheckMessageTypes.SetSiteAccess,
                { pageUrl, enabled },
              )
              if (!result.success || typeof result.siteAllowed !== "boolean") {
                setError(true)
                return
              }
              setAllowed(result.siteAllowed)
              if (result.siteAllowed !== enabled) setError(true)
            } catch {
              setError(true)
            } finally {
              setSaving(false)
            }
          }}
        />
      </div>
      {!globallyEnabled ? (
        <p className="text-muted-foreground">
          {t("webAiApiCheck:siteControl.globalDisabled")}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-destructive-soft-foreground">
          {t("webAiApiCheck:siteControl.failed")}
        </p>
      ) : null}
      <Button
        size="sm"
        variant="link"
        onClick={() =>
          void sendRuntimeMessage({
            action: RuntimeActionIds.OpenSettingsWebAiApiCheck,
          }).catch(() => setError(true))
        }
      >
        {t("webAiApiCheck:confirmToast.settings")}
      </Button>
    </div>
  )
}
