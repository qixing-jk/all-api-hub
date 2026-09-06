import { useEffect, useRef } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import {
  getPendingAccountDialogRecovery,
  receiveAccountDialogRecovery,
  watchPendingAccountDialogRecovery,
} from "~/features/AccountManagement/accountDialogRecovery"
import type { AccountDialogRecoveryState } from "~/features/AccountManagement/components/AccountDialog/models"
import { isExtensionSidePanel } from "~/utils/browser"
import { getActiveTab } from "~/utils/browser/browserApi"

/** Receives popup handoffs without replacing another unfinished account form. */
export function useAccountDialogRecoveryReceiver({
  enabled,
  initialRecoveryId,
  onReceive,
}: {
  enabled: boolean
  initialRecoveryId?: string
  onReceive: (
    state: AccountDialogRecoveryState,
  ) => "accepted" | "busy" | "unavailable"
}) {
  const { t } = useTranslation("accountDialog")
  const received = useRef(new Set<string>())
  const lastBlockedId = useRef<string | null>(null)

  useEffect(() => {
    if (!enabled || (!initialRecoveryId && !isExtensionSidePanel())) return
    let cancelled = false
    let processing = false
    let stopWatching = () => {}

    const receive = async (id: string | null, windowId?: number) => {
      if (!id || cancelled || processing || received.current.has(id)) return
      processing = true
      try {
        let inspected = false
        const restored = await receiveAccountDialogRecovery(
          id,
          (state) => {
            if (cancelled) return false
            inspected = true
            const outcome = onReceive(state)
            if (outcome === "accepted") {
              received.current.add(id)
              return true
            }
            if (lastBlockedId.current !== id) {
              lastBlockedId.current = id
              toast.error(
                outcome === "busy"
                  ? t("accessTokenVerification.destinationBusy")
                  : t("accessTokenVerification.restoreFailed"),
              )
            }
            return false
          },
          windowId,
        )
        if (
          !restored &&
          !inspected &&
          !cancelled &&
          lastBlockedId.current !== id
        ) {
          lastBlockedId.current = id
          toast.error(t("accessTokenVerification.restoreFailed"))
        }
      } catch {
        if (!cancelled) toast.error(t("accessTokenVerification.restoreFailed"))
      } finally {
        processing = false
      }
    }

    if (initialRecoveryId) {
      void receive(initialRecoveryId)
    } else {
      void getActiveTab()
        .then((tab) => {
          if (cancelled || typeof tab?.windowId !== "number") return
          const windowId = tab.windowId
          const consumePending = () => {
            void getPendingAccountDialogRecovery(windowId)
              .then((id) => receive(id, windowId))
              .catch(() => {
                if (!cancelled)
                  toast.error(t("accessTokenVerification.restoreFailed"))
              })
          }
          stopWatching = watchPendingAccountDialogRecovery(
            windowId,
            consumePending,
          )
          consumePending()
        })
        .catch(() => {
          if (!cancelled)
            toast.error(t("accessTokenVerification.restoreFailed"))
        })
    }

    return () => {
      cancelled = true
      stopWatching()
    }
  }, [enabled, initialRecoveryId, onReceive, t])
}
