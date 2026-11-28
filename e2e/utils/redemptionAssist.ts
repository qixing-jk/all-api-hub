import { expect } from "@playwright/test"

import { RuntimeActionIds } from "~/constants/runtimeActions"

import type { getServiceWorker } from "./extensionState"

type ServiceWorker = Awaited<ReturnType<typeof getServiceWorker>>

async function sendToContent(
  serviceWorker: ServiceWorker,
  pageUrl: string,
  message: Record<string, unknown>,
) {
  return serviceWorker.evaluate(
    async ({ pageUrl, message }) => {
      const tabs = await chrome.tabs.query({})
      const tabId = tabs.find((tab) => tab.url === pageUrl)?.id
      if (tabId == null) return { error: "Target tab not found" }
      try {
        return await chrome.tabs.sendMessage(tabId, message)
      } catch (error) {
        return { error: String(error) }
      }
    },
    { pageUrl, message },
  )
}

/** Wait only on a read-only handshake; never retry a possibly admitted trigger. */
export async function waitForRedemptionAssistReady(
  serviceWorker: ServiceWorker,
  pageUrl: string,
  detectionEnabled?: boolean,
) {
  await expect
    .poll(() =>
      sendToContent(serviceWorker, pageUrl, {
        action: RuntimeActionIds.RedemptionAssistGetStatus,
      }),
    )
    .toMatchObject({
      ready: true,
      ...(detectionEnabled === undefined ? {} : { detectionEnabled }),
    })
}

export async function sendRedemptionContextMenuTrigger(
  serviceWorker: ServiceWorker,
  params: { pageUrl: string; selectionText: string },
) {
  await waitForRedemptionAssistReady(serviceWorker, params.pageUrl)
  const response = await sendToContent(serviceWorker, params.pageUrl, {
    action: RuntimeActionIds.RedemptionAssistContextMenuTrigger,
    ...params,
  })
  expect(response).toMatchObject({ accepted: true })
}
