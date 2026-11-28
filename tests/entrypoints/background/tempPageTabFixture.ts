import { vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"

/** Adds committed URL and document identity to the temp page browser mocks. */
export function createTempPageTabFixture<Message extends { action: string }>(
  getTab: (tabId: number) => Promise<Partial<browser.tabs.Tab>>,
  updateTab: (tabId: number, options: { url?: string }) => Promise<unknown>,
  sendMessage: (
    tabId: number,
    message: Message,
    ...options: unknown[]
  ) => Promise<unknown>,
) {
  let timeOrigin = 0
  const documents = new Map<number, { url: string; timeOrigin: number }>()
  const loaded = new Map<number, { url: string; timeOrigin: number }>()
  const setDocument = (tabId: number, url: string) => {
    documents.set(tabId, { url, timeOrigin: ++timeOrigin })
  }
  return {
    setDocument,
    async get(tabId: number) {
      const tab = await getTab(tabId)
      const document = documents.get(tabId)
      const url = tab.url ?? document?.url
      if (url && tab.status === "complete") {
        loaded.set(tabId, { url, timeOrigin: document?.timeOrigin ?? 0 })
      } else {
        loaded.delete(tabId)
      }
      return { ...tab, url }
    },
    update: vi.fn(async (tabId: number, options: { url?: string }) => {
      const result = await updateTab(tabId, options)
      if (options.url) setDocument(tabId, options.url)
      return result
    }),
    async sendMessage(tabId: number, message: Message, ...options: unknown[]) {
      const document = loaded.get(tabId)
      if (
        message.action === RuntimeActionIds.ContentGetDocumentState &&
        document
      )
        return { ...document, readyState: "complete" }
      return sendMessage(tabId, message, ...options)
    },
  }
}
