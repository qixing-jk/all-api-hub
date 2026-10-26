import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button, Spinner, Switch } from "~/components/ui"
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
    setError(false)
    void sendWebAiApiCheckMessage(WebAiApiCheckMessageTypes.ShouldPrompt, {
      pageUrl,
    })
      .then((result) => {
        if (!active) return
        if (!result.success || typeof result.siteAllowed !== "boolean") {
          setError(true)
          return
        }
        setAllowed(result.siteAllowed)
        setGloballyEnabled(result.autoDetectEnabled ?? true)
      })
      .catch(() => {
        if (active) setError(true)
      })
    return () => {
      active = false
    }
  }, [pageUrl])
  let siteHost = ""
  try {
    siteHost = new URL(pageUrl).host
  } catch {
    /* An unavailable page identity does not block settings navigation. */
  }
  return (
    <section className="text-sm" aria-label={t("common:labels.settings")}>
      <div className="space-y-density-1 border-border-subtle border-b p-4">
        <h3 className="text-foreground font-semibold">
          {t("common:labels.settings")}
        </h3>
        {siteHost ? (
          <p
            className="text-muted-foreground truncate text-xs"
            title={siteHost}
          >
            {siteHost}
          </p>
        ) : null}
      </div>
      <div className="space-y-density-2 p-4">
        {allowed === null && !error ? <Spinner size="sm" /> : null}
        {allowed !== null ? (
          <>
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
                    if (
                      !result.success ||
                      typeof result.siteAllowed !== "boolean"
                    ) {
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
            <p className="text-muted-foreground text-xs leading-relaxed">
              {t("webAiApiCheck:settings.autoDetect.enableDesc")}
            </p>
            {!globallyEnabled ? (
              <p className="text-muted-foreground">
                {t("webAiApiCheck:siteControl.globalDisabled")}
              </p>
            ) : null}
          </>
        ) : null}
        {error ? (
          <p role="alert" className="text-destructive-soft-foreground">
            {t("webAiApiCheck:siteControl.failed")}
          </p>
        ) : null}
      </div>
      <div className="border-border-subtle border-t p-3">
        <Button
          size="sm"
          variant="outline"
          className="w-full"
          onClick={() =>
            void sendRuntimeMessage({
              action: RuntimeActionIds.OpenSettingsWebAiApiCheck,
            }).catch(() => setError(true))
          }
        >
          {t("webAiApiCheck:confirmToast.settings")}
        </Button>
      </div>
    </section>
  )
}
