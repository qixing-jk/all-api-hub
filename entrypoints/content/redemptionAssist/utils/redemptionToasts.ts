import * as React from "react"
import toast from "react-hot-toast/headless"

import type { DisplaySiteData } from "~/types"

import { RedemptionAccountSelectToast } from "../components/RedemptionAccountSelectToast"
import { RedemptionLoadingToast } from "../components/RedemptionLoadingToast"
import {
  RedemptionPromptToast,
  type RedemptionPromptAction,
} from "../components/RedemptionPromptToast"
import { ensureRedemptionToastUi } from "../uiRoot"

export function showRedeemLoadingToast(message: string) {
  void ensureRedemptionToastUi()
  return toast.custom(
    () => React.createElement(RedemptionLoadingToast, { message }),
    {
      duration: Infinity,
    },
  )
}

export function dismissToast(toastId?: string) {
  toast.dismiss(toastId)
}

export function showAccountSelectToast(
  accounts: DisplaySiteData[],
  options?: { title?: string; message?: string },
): Promise<DisplaySiteData | null> {
  return new Promise((resolve) => {
    let resolved = false

    const handleResolve = (
      account: DisplaySiteData | null,
      toastId: string,
    ) => {
      if (resolved) return
      resolved = true
      toast.dismiss(toastId)
      resolve(account)
    }

    void ensureRedemptionToastUi()

    toast.custom(
      (toastInstance) => {
        const toastId = toastInstance.id
        return React.createElement(RedemptionAccountSelectToast, {
          title: options?.title,
          message: options?.message,
          accounts,
          onSelect: (account: DisplaySiteData | null) =>
            handleResolve(account, toastId),
        })
      },
      {
        // Keep the account select toast on screen until user confirms or cancels
        duration: Infinity,
      },
    )
  })
}

export function showRedemptionPromptToast(
  message: string,
): Promise<RedemptionPromptAction> {
  return new Promise((resolve) => {
    let resolved = false

    const handleResolve = (action: RedemptionPromptAction, toastId: string) => {
      if (resolved) return
      resolved = true
      toast.dismiss(toastId)
      resolve(action)
    }
    void ensureRedemptionToastUi()

    toast.custom((toastInstance) => {
      const toastId = toastInstance.id
      return React.createElement(RedemptionPromptToast, {
        message,
        onAction: (action: RedemptionPromptAction) =>
          handleResolve(action, toastId),
      })
    })
  })
}

export function showRedeemResultToast(success: boolean, message: string) {
  if (!message) return

  void ensureRedemptionToastUi()

  if (success) {
    toast.success(message)
  } else {
    toast.error(message)
  }
}
