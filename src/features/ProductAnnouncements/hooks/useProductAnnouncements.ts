import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  PRODUCT_ANNOUNCEMENT_RELOAD_EVENT,
  requestProductAnnouncementsReload,
} from "~/features/ProductAnnouncements/events"
import type { ProductAnnouncementView } from "~/services/productAnnouncements/catalog"
import { sendProductAnnouncementsMessage } from "~/services/productAnnouncements/messaging"
import type { ProductAnnouncementRuntimeState } from "~/services/productAnnouncements/service"
import { ProductAnnouncementsMessageTypes } from "~/services/runtimeMessaging/messageTypes"

const EMPTY_VIEW: ProductAnnouncementView = {
  notices: [],
  activeNotices: [],
  dismissedNotices: [],
  primaryRiskNotice: null,
  activeRiskCount: 0,
  unseenActiveCount: 0,
}

const EMPTY_STATE: ProductAnnouncementRuntimeState = {
  view: EMPTY_VIEW,
}

/**
 * Loads product announcements through background messaging and exposes best-effort mutations.
 */
export function useProductAnnouncements() {
  const { i18n } = useTranslation()
  const [state, setState] =
    useState<ProductAnnouncementRuntimeState>(EMPTY_STATE)
  const [isLoading, setIsLoading] = useState(true)
  const isMountedRef = useRef(false)
  const reloadSequenceRef = useRef(0)

  const reload = useCallback(async () => {
    if (!isMountedRef.current) {
      return
    }

    const sequence = reloadSequenceRef.current + 1
    reloadSequenceRef.current = sequence
    setIsLoading(true)

    try {
      const response = await sendProductAnnouncementsMessage(
        ProductAnnouncementsMessageTypes.GetState,
        { locale: i18n.language },
      )

      if (
        response.success &&
        isMountedRef.current &&
        sequence === reloadSequenceRef.current
      ) {
        setState(response.data)
      }
    } catch {
      // Announcement state is best-effort; UI should not fail when messaging is unavailable.
    } finally {
      if (isMountedRef.current && sequence === reloadSequenceRef.current) {
        setIsLoading(false)
      }
    }
  }, [i18n.language])

  const markSeen = useCallback(async (ids: string[]) => {
    if (ids.length === 0) {
      return true
    }

    try {
      const response = await sendProductAnnouncementsMessage(
        ProductAnnouncementsMessageTypes.MarkSeen,
        { ids },
      )

      if (response.success && isMountedRef.current) {
        requestProductAnnouncementsReload()
      }

      return response.success
    } catch {
      // Ignore best-effort read-state updates when the background service is unavailable.
      return false
    }
  }, [])

  const dismiss = useCallback(async (id: string, revision: number) => {
    try {
      const response = await sendProductAnnouncementsMessage(
        ProductAnnouncementsMessageTypes.Dismiss,
        { id, revision },
      )

      if (response.success && isMountedRef.current) {
        requestProductAnnouncementsReload()
      }
    } catch {
      // Keep the current list visible if dismissal cannot be persisted.
    }
  }, [])

  const restore = useCallback(async (id: string) => {
    try {
      const response = await sendProductAnnouncementsMessage(
        ProductAnnouncementsMessageTypes.Restore,
        { id },
      )

      if (response.success && isMountedRef.current) {
        requestProductAnnouncementsReload()
      }

      return response.success
    } catch {
      // Keep the current dismissed list visible if restore cannot be persisted.
      return false
    }
  }, [])

  useEffect(() => {
    isMountedRef.current = true
    void reload()

    return () => {
      isMountedRef.current = false
      reloadSequenceRef.current += 1
    }
  }, [reload])

  useEffect(() => {
    const handleReloadRequest = () => {
      void reload()
    }

    window.addEventListener(
      PRODUCT_ANNOUNCEMENT_RELOAD_EVENT,
      handleReloadRequest,
    )

    return () => {
      window.removeEventListener(
        PRODUCT_ANNOUNCEMENT_RELOAD_EVENT,
        handleReloadRequest,
      )
    }
  }, [reload])

  return {
    state,
    isLoading,
    reload,
    markSeen,
    dismiss,
    restore,
  }
}
