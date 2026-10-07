import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { TaskNotificationMessageTypes } from "~/services/notifications/messaging"
import { PreferencesMessageTypes } from "~/services/preferences/messaging"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import { seedUserPreferences } from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

// Headless Chrome cannot accept the native optional-permission prompt. Grant
// notifications only in an isolated manifest copy, preserving the real API.
const notificationTest = test.extend({
  extensionDir: async ({ extensionDir }, run) => {
    const copy = await fs.mkdtemp(
      path.join(os.tmpdir(), "aah-native-notifications-"),
    )
    try {
      await fs.cp(extensionDir, copy, { recursive: true })
      const manifestPath = path.join(copy, "manifest.json")
      const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"))
      manifest.permissions = [
        ...new Set([...manifest.permissions, "notifications"]),
      ]
      manifest.optional_permissions = manifest.optional_permissions.filter(
        (permission: string) => permission !== "notifications",
      )
      await fs.writeFile(manifestPath, JSON.stringify(manifest))
      await run(copy)
    } finally {
      await fs.rm(copy, { recursive: true, force: true })
    }
  },
})

test("waits for native context menu removal before recreating owned menus", async ({
  context,
  extensionId,
  page,
}) => {
  await page.goto(`chrome-extension://${extensionId}/options.html`)
  await waitForExtensionRoot(page)
  const worker = await getServiceWorker(context)
  await worker.evaluate(() => {
    const host = globalThis as any
    host.__menuEvents = []
    const api = host.chrome.contextMenus
    const remove = api.remove.bind(api)
    const create = api.create.bind(api)
    api.remove = (id: string, callback?: () => void) => {
      const complete = () => host.__menuEvents.push(`removed:${id}`)
      if (callback) {
        return remove(id, () => {
          complete()
          callback()
        })
      }
      const result = remove(id)
      return result?.then(complete)
    }
    api.create = (properties: { id: string }, callback?: () => void) => {
      host.__menuEvents.push(`created:${properties.id}`)
      return create(properties, callback)
    }
  })

  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await page.evaluate(async (type) => {
      return await (globalThis as any).chrome.runtime.sendMessage({
        id: 1,
        type,
        timestamp: Date.now(),
      })
    }, PreferencesMessageTypes.RefreshContextMenus)
    expect(result.res.success).toBe(true)
  }

  const events: string[] = await worker.evaluate(
    () => (globalThis as any).__menuEvents,
  )
  const expected = [
    "removed:redemption-assist-context-menu",
    "removed:ai-api-check-context-menu",
    "created:redemption-assist-context-menu",
    "created:ai-api-check-context-menu",
  ]
  expect(events).toEqual([...expected, ...expected])
})

notificationTest(
  "reports native notification creation errors through the production message handler",
  async ({ context, extensionId, page }) => {
    const worker = await getServiceWorker(context)
    await seedUserPreferences(worker)
    await page.goto(`chrome-extension://${extensionId}/options.html`)
    await waitForExtensionRoot(page)
    await worker.evaluate(() => {
      const api = (globalThis as any).chrome.notifications
      const create = api.create.bind(api)
      // Keep the native API and its callback/Promise behavior; force an image
      // load failure so no operating-system notification is displayed.
      api.create = (
        id: string,
        options: object,
        callback?: (id: string) => void,
      ) =>
        create(
          id,
          {
            ...options,
            iconUrl: (globalThis as any).chrome.runtime.getURL(
              "missing-notification-icon.png",
            ),
          },
          callback,
        )
    })
    const result = await page.evaluate(async (type) => {
      return await (globalThis as any).chrome.runtime.sendMessage({
        id: 1,
        type,
        timestamp: Date.now(),
        data: { channel: "browser" },
      })
    }, TaskNotificationMessageTypes.Test)
    expect(result.res.success).toBe(false)
    expect(result.res.error).toBeTruthy()
  },
)
