import { expect } from "@playwright/test"

import { RuntimeActionIds } from "~/constants/runtimeActions"

import type { getServiceWorker } from "./extensionState"

export async function sendRedemptionContextMenuTrigger(
  serviceWorker: Awaited<ReturnType<typeof getServiceWorker>>,
  params: {
    pageUrl: string
    selectionText: string
  },
) {
  await expect
    .poll(async () => {
      return await serviceWorker.evaluate(
        async ({ action, pageUrl, selectionText }) => {
          const chromeApi = globalThis.chrome
          const tabs = await chromeApi.tabs.query({})
          const targetTab = tabs.find((tab) => tab.url === pageUrl)

          const tabId = targetTab?.id
          if (tabId == null) {
            return { success: false, error: "Target tab not found" }
          }

          return await new Promise<{ success: boolean; error?: string }>(
            (resolve) => {
              chromeApi.tabs.sendMessage(
                tabId,
                {
                  action,
                  pageUrl,
                  selectionText,
                },
                () => {
                  const error = chromeApi.runtime?.lastError
                  const errorMessage =
                    typeof error?.message === "string" ? error.message : ""
                  if (errorMessage.includes("message port closed")) {
                    resolve({ success: true })
                    return
                  }

                  resolve(
                    errorMessage
                      ? { success: false, error: errorMessage }
                      : { success: true },
                  )
                },
              )
            },
          )
        },
        {
          action: RuntimeActionIds.RedemptionAssistContextMenuTrigger,
          pageUrl: params.pageUrl,
          selectionText: params.selectionText,
        },
      )
    })
    .toMatchObject({ success: true })
}
