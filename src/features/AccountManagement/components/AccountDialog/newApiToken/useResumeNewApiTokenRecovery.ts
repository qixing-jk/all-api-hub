import { useEffect, useRef, useState } from "react"

import { isExtensionPopup } from "~/utils/browser"

import {
  ACCOUNT_DIALOG_RECOVERY_ACTIONS,
  type AccountDialogDraft,
  type AccountDialogRecoveryState,
} from "../models"
import { openAccountAccessTokenPage } from "../recovery/openAccountAccessTokenPage"

/** Resumes a popup's token action once its account draft is restored. */
export function useResumeNewApiTokenRecovery({
  isOpen,
  showAccountForm,
  recoveryState,
  url,
  siteType,
  userId,
  startTokenCreation,
  focusAccessToken,
}: Pick<AccountDialogDraft, "siteType" | "userId"> & {
  isOpen: boolean
  showAccountForm: boolean
  recoveryState?: AccountDialogRecoveryState | null
  url: string
  startTokenCreation: () => void
  focusAccessToken: () => void
}) {
  const resumedRecovery = useRef<AccountDialogRecoveryState | null>(null)
  const activeRecovery = useRef<AccountDialogRecoveryState | null>(null)
  const [siteOpenFailed, setSiteOpenFailed] = useState(false)

  useEffect(() => {
    activeRecovery.current = isOpen ? (recoveryState ?? null) : null
    if (!isOpen) {
      resumedRecovery.current = null
      setSiteOpenFailed(false)
    }
    return () => {
      activeRecovery.current = null
    }
  }, [isOpen, recoveryState])

  useEffect(() => {
    if (
      !isOpen ||
      !showAccountForm ||
      isExtensionPopup() ||
      !recoveryState ||
      resumedRecovery.current === recoveryState ||
      url !== recoveryState.url ||
      siteType !== recoveryState.draft.siteType ||
      userId !== recoveryState.draft.userId
    )
      return

    switch (recoveryState.recoveryAction) {
      case ACCOUNT_DIALOG_RECOVERY_ACTIONS.NewApiTokenCreate:
        resumedRecovery.current = recoveryState
        setSiteOpenFailed(false)
        startTokenCreation()
        return
      case ACCOUNT_DIALOG_RECOVERY_ACTIONS.NewApiTokenSite: {
        resumedRecovery.current = recoveryState
        setSiteOpenFailed(false)
        focusAccessToken()
        const showFailure = () => {
          if (activeRecovery.current === recoveryState) setSiteOpenFailed(true)
        }
        void openAccountAccessTokenPage({ baseUrl: url, siteType }).then(
          (opened) => {
            if (!opened) showFailure()
          },
          showFailure,
        )
        return
      }
    }
  }, [
    focusAccessToken,
    isOpen,
    recoveryState,
    showAccountForm,
    siteType,
    startTokenCreation,
    url,
    userId,
  ])

  return {
    siteOpenFailed,
    clearSiteOpenFailure: () => setSiteOpenFailed(false),
  }
}
