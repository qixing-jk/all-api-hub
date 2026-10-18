import { RuntimeActionIds } from "~/constants/runtimeActions"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import { getServiceWorker } from "~~/e2e/utils/extensionState"
import { captureVisualViews } from "~~/e2e/utils/visualCapture"

// Guest-only preflight: no saved account, credentials or login submission.
const target = process.env.AAH_E2E_PASSWORD_ENTRY_URL
test("public native password login entry opens its form without submitting credentials", async ({
  context,
  page,
  extensionDir,
}) => {
  test.skip(
    !target,
    "Set AAH_E2E_PASSWORD_ENTRY_URL to inspect a public login page",
  )
  const url = new URL(target!)
  const loginRequests: string[] = []
  context.on("request", (request) => {
    const path = new URL(request.url()).pathname
    if (["/api/user/login", "/api/v1/auth/login"].includes(path))
      loginRequests.push(path)
  })
  await page.goto(url.href, { waitUntil: "domcontentloaded" })
  await captureVisualViews({
    page,
    ready: page.locator("body"),
    id: "public-password-entry-before",
    extensionDir,
  })
  const worker = await getServiceWorker(context)
  const action =
    process.env.AAH_E2E_PASSWORD_ENTRY_PROVIDER === "sub2api"
      ? RuntimeActionIds.ContentSub2ApiPasswordUi
      : RuntimeActionIds.ContentNewApiPasswordUi
  const result = await worker.evaluate(
    async ({ origin, action }) => {
      const api = (globalThis as any).chrome
      const tabs = await api.tabs.query({})
      const tab = tabs.find((item: { url?: string }) =>
        item.url?.startsWith(origin + "/"),
      )
      if (!tab) throw new Error("Public login tab was not found")
      return api.tabs.sendMessage(tab.id, {
        action,
        phase: "prepare",
        origin,
        requestId: "public-entry-preflight",
        expectedIdentity: "public-entry-preflight",
        canResetSession: false,
      })
    },
    { origin: url.origin, action },
  )
  await captureVisualViews({
    page,
    ready: page.locator("body"),
    id: "public-password-entry-after",
    extensionDir,
  })
  expect(result).toEqual({ kind: "ready" })
  await expect(page.locator('input[type="password"]')).toBeVisible()
  await expect(page.locator('input[type="password"]')).toHaveValue("")
  expect(loginRequests).toEqual([])
})
