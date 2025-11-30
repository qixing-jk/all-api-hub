import * as React from "react"
import toast from "react-hot-toast/headless"

import type { DisplaySiteData } from "~/types"

import { RedemptionAccountSelectToast } from "../components/RedemptionAccountSelectToast.tsx"
import { RedemptionLoadingToast } from "../components/RedemptionLoadingToast.tsx"
import {
  RedemptionPromptToast,
  type RedemptionPromptAction
} from "../components/RedemptionPromptToast.tsx"

export function showRedeemLoadingToast(message: string) {
  return toast.custom(
    () => React.createElement(RedemptionLoadingToast, { message }),
    {
      duration: Infinity
    }
  )
}

export function dismissToast(toastId?: string) {
  toast.dismiss(toastId)
}

export function showAccountSelectToast(
  accounts: DisplaySiteData[],
  options?: { title?: string; message?: string }
): Promise<DisplaySiteData | null> {
  return new Promise((resolve) => {
    let resolved = false

    const handleResolve = (
      account: DisplaySiteData | null,
      toastId: string
    ) => {
      if (resolved) return
      resolved = true
      toast.dismiss(toastId)
      resolve(account)
    }

    toast.custom(
      (toastInstance) => {
        const toastId = toastInstance.id
        return React.createElement(RedemptionAccountSelectToast, {
          title: options?.title,
          message: options?.message,
          accounts,
          onSelect: (account: DisplaySiteData | null) =>
            handleResolve(account, toastId)
        })
      },
      {
        // Keep the account select toast on screen until user confirms or cancels
        duration: Infinity
      }
    )
  })
}

export function showRedemptionPromptToast(
  message: string
): Promise<RedemptionPromptAction> {
  return new Promise((resolve) => {
    let resolved = false

    const handleResolve = (action: RedemptionPromptAction, toastId: string) => {
      if (resolved) return
      resolved = true
      toast.dismiss(toastId)
      resolve(action)
    }

    toast.custom((toastInstance) => {
      const toastId = toastInstance.id
      return React.createElement(RedemptionPromptToast, {
        message,
        onAction: (action: RedemptionPromptAction) =>
          handleResolve(action, toastId)
      })
    })
  })
}

export function showRedeemResultToast(success: boolean, message: string) {
  if (!message) return

  if (success) {
    toast.success(message)
  } else {
    toast.error(message)
  }
}
