import { useEffect, useMemo } from "react"
import { useTranslation } from "react-i18next"

import {
  Body,
  Button,
  Card,
  CardContent,
  CardHeader,
  Heading3,
} from "~/components/ui"

/** Removes a previously applied prefix from a title string. */
function stripPrefixedTitle(title: string, prefix: string) {
  const trimmed = title.trim()
  const withDot = `${prefix} · `
  if (trimmed.startsWith(withDot)) {
    return trimmed.slice(withDot.length)
  }
  if (trimmed.startsWith(prefix)) {
    return trimmed.slice(prefix.length).trim().replace(/^·\s*/, "")
  }
  return title
}

/**
 * Prefixes the current page title so users can recognize the temporary
 * shield-bypass context, even while the host page changes its own title.
 */
function usePrefixedDocumentTitle(prefix: string) {
  const normalizedPrefix = prefix.trim()

  useEffect(() => {
    if (!normalizedPrefix) return

    let disposed = false
    let applying = false

    const apply = () => {
      if (disposed || applying) return
      applying = true
      try {
        const current = typeof document.title === "string" ? document.title : ""
        const base = stripPrefixedTitle(current || "", normalizedPrefix).trim()
        const next = base ? `${normalizedPrefix} · ${base}` : normalizedPrefix
        if (document.title !== next) {
          document.title = next
        }
      } finally {
        applying = false
      }
    }

    apply()

    const titleEl = document.querySelector("title")
    const observer = new MutationObserver(() => apply())
    if (titleEl) {
      observer.observe(titleEl, { childList: true, subtree: true })
    } else {
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
      })
    }

    const interval = window.setInterval(apply, 1000)

    return () => {
      disposed = true
      observer.disconnect()
      window.clearInterval(interval)

      try {
        const current = typeof document.title === "string" ? document.title : ""
        const base = stripPrefixedTitle(current || "", normalizedPrefix).trim()
        if (base && document.title !== base) {
          document.title = base
        }
      } catch {
        // ignore
      }
    }
  }, [normalizedPrefix])
}

/**
 * Toast/prompt shown inside the temporary tab/window used for shield/protection bypass.
 */
export function ShieldBypassPromptToast({
  onDismiss,
  onOpenSettings,
}: {
  onDismiss: () => void
  onOpenSettings: () => void
}) {
  const { t } = useTranslation("shieldBypass")

  const titlePrefix = useMemo(() => t("titlePrefix"), [t])
  usePrefixedDocumentTitle(titlePrefix)

  return (
    <Card>
      <CardHeader padding="sm">
        <Heading3>{t("toast.title")}</Heading3>
      </CardHeader>
      <CardContent padding="sm">
        <Body className="whitespace-pre-line">{t("toast.body")}</Body>
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="secondary" onClick={onDismiss}>
            {t("toast.actions.dismiss")}
          </Button>
          <Button onClick={onOpenSettings}>
            {t("toast.actions.openSettings")}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
