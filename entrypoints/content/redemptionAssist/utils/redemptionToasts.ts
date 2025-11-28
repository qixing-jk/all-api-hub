import * as React from "react"
import { createRoot } from "react-dom/client"
import toast from "react-hot-toast"

import type { DisplaySiteData } from "~/types"

import { ContentReactRoot } from "../components/ContentReactRoot.tsx"
import { RedemptionAccountSelectToast } from "../components/RedemptionAccountSelectToast.tsx"
import {
  RedemptionPromptToast,
  type RedemptionPromptAction
} from "../components/RedemptionPromptToast.tsx"

let redemptionToastRoot: any | null = null

function ensureRedemptionToastRoot() {
  if (redemptionToastRoot) {
    return
  }

  const existing = document.getElementById("all-api-hub-redemption-toast-root")
  const container = existing || document.createElement("div")

  if (!existing) {
    container.id = "all-api-hub-redemption-toast-root"
    container.style.position = "fixed"
    container.style.zIndex = "2147483647"
    container.style.top = "0"
    container.style.left = "0"
    container.style.width = "100%"
    container.style.height = "0"
    container.style.pointerEvents = "none"
    document.documentElement.appendChild(container)
  }

  redemptionToastRoot = createRoot(container)
  redemptionToastRoot.render(React.createElement(ContentReactRoot))
}

export function showAccountSelectToast(
  accounts: DisplaySiteData[],
  options?: { title?: string; message?: string }
): Promise<DisplaySiteData | null> {
  ensureRedemptionToastRoot()

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
  message: string = "test"
): Promise<RedemptionPromptAction> {
  ensureRedemptionToastRoot()

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
  ensureRedemptionToastRoot()
  if (!message) return

  if (success) {
    toast.success(message)
  } else {
    toast.error(message)
  }
}
