import { History } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "~/components/ui"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { PROTECTION_BYPASS_HISTORY_LIMIT } from "~/services/protectionBypass/historyStorage"
import { replaceWithinOptionsPage } from "~/utils/navigation"

import ProtectionBypassHistoryDialog from "./ProtectionBypassHistoryDialog"
import { SHIELD_SETTINGS_TARGET_IDS } from "./searchTargets"

/** Recognize both current settings URLs and legacy heading anchors. */
function isHistoryRequested() {
  const { hash, search } = window.location
  const params = new URLSearchParams(search)
  return (
    hash === `#${SHIELD_SETTINGS_TARGET_IDS.history}` ||
    ((hash === `#${MENU_ITEM_IDS.BASIC}` || !hash) &&
      (!params.get("tab") || params.get("tab") === "refresh") &&
      params.get("anchor") === SHIELD_SETTINGS_TARGET_IDS.history)
  )
}

/** Keep a discoverable settings entry while diagnostic history stays closed by default. */
export default function ProtectionBypassHistory() {
  const { t } = useTranslation("shieldBypass")
  const [isOpen, setIsOpen] = useState(false)
  const pendingSettingsTarget = useRef<string | null>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    const syncLocation = () => setIsOpen(isHistoryRequested())
    syncLocation()
    window.addEventListener("hashchange", syncLocation)
    window.addEventListener("popstate", syncLocation)
    return () => {
      window.removeEventListener("hashchange", syncLocation)
      window.removeEventListener("popstate", syncLocation)
    }
  }, [])

  const changeOpen = useCallback((open: boolean) => {
    setIsOpen(open)
    const params = new URLSearchParams(window.location.search)
    if (open) {
      params.set("tab", "refresh")
      params.set("anchor", SHIELD_SETTINGS_TARGET_IDS.history)
      params.delete("highlight")
    } else {
      if (!isHistoryRequested()) return
      params.delete("anchor")
      if (params.get("highlight") === SHIELD_SETTINGS_TARGET_IDS.history)
        params.delete("highlight")
    }
    replaceWithinOptionsPage(
      `#${MENU_ITEM_IDS.BASIC}`,
      Object.fromEntries(params),
    )
  }, [])

  const navigateToSettings = (target: string) => {
    pendingSettingsTarget.current = target
    changeOpen(false)
  }

  return (
    <Dialog open={isOpen} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button
          id={SHIELD_SETTINGS_TARGET_IDS.history}
          variant="outline"
          size="sm"
          aria-label={t("history.open")}
          title={t("history.entryDescription")}
          leftIcon={<History className="size-4" aria-hidden="true" />}
        >
          {t("history.title")}
        </Button>
      </DialogTrigger>
      <DialogContent
        className="flex h-[min(90dvh,56rem)] max-w-[calc(100%-1rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl"
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          titleRef.current?.focus({ preventScroll: true })
        }}
        onCloseAutoFocus={(event) => {
          const targetId = pendingSettingsTarget.current
          if (!targetId) return
          event.preventDefault()
          pendingSettingsTarget.current = null
          replaceWithinOptionsPage(`#${MENU_ITEM_IDS.BASIC}`, {
            tab: "refresh",
            anchor: targetId,
            highlight: targetId,
          })
          window.requestAnimationFrame(() => {
            const target = document.getElementById(targetId)
            target?.scrollIntoView({ block: "center" })
            target
              ?.querySelector<HTMLElement>("button, input, [tabindex]")
              ?.focus({ preventScroll: true })
          })
        }}
      >
        <DialogHeader className="shrink-0 border-b p-4 pr-12 text-left">
          <DialogTitle ref={titleRef} tabIndex={-1} className="outline-none">
            {t("history.title")}
          </DialogTitle>
          <DialogDescription>
            {t("history.description", {
              limit: PROTECTION_BYPASS_HISTORY_LIMIT,
            })}
          </DialogDescription>
        </DialogHeader>
        <ProtectionBypassHistoryDialog
          onNavigateToSettings={navigateToSettings}
        />
      </DialogContent>
    </Dialog>
  )
}
