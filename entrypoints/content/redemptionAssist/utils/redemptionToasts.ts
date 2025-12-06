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

/**
 * Shows an indefinite loading toast while auto-redeem runs.
 * @param message Loading copy for the toast body.
 * @returns Toast ID for later dismissal.
 */
export async function showRedeemLoadingToast(message: string) {
  await ensureRedemptionToastUi()
  return toast.custom(
    () => React.createElement(RedemptionLoadingToast, { message }),
    {
      duration: Infinity,
    },
  )
}

/**
 * Wrapper around react-hot-toast dismiss to avoid direct dependency elsewhere.
 * @param toastId Optional toast identifier.
 */
export function dismissToast(toastId?: string) {
  toast.dismiss(toastId)
}

/**
 * Prompts user to select an account when multiple candidates exist.
 * @param accounts Candidate account list.
 * @param options Optional title/message overrides.
 * @returns Selected account or null when cancelled.
 */
export async function showAccountSelectToast(
  accounts: DisplaySiteData[],
  options?: { title?: string; message?: string },
): Promise<DisplaySiteData | null> {
  await ensureRedemptionToastUi()

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

/**
 * Renders prompt toast asking user whether to auto redeem.
 * @param message Prompt copy.
 * @returns Action user chose (auto/manual/cancel).
 */
export async function showRedemptionPromptToast(
  message: string,
): Promise<RedemptionPromptAction> {
  await ensureRedemptionToastUi()

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
          handleResolve(action, toastId),
      })
    })
  })
}

/**
 * Displays success/error result toast after redeem completes.
 * @param success Whether operation succeeded.
 * @param message Message to show (no trailing period per UI rules).
 */
export async function showRedeemResultToast(success: boolean, message: string) {
  if (!message) return

  await ensureRedemptionToastUi()

  if (success) {
    toast.success(message)
  } else {
    toast.error(message)
  }
}
