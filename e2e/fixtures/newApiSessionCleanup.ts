import {
  NEW_API_OWNED_SESSION_ACTIONS,
  type NewApiOwnedSessionResponse,
} from "~/services/managedSites/newApiOwnedSession/contracts"
import { test as extensionTest } from "~~/e2e/fixtures/extensionTest"

export const test = extensionTest.extend<{
  newApiSessionCleanupOrigin: string | undefined
  newApiSessionCleanup: void
}>({
  newApiSessionCleanupOrigin: [undefined, { option: true }],
  newApiSessionCleanup: [
    async ({ context, extensionId, newApiSessionCleanupOrigin }, use) => {
      await use()
      if (!newApiSessionCleanupOrigin) return

      await test.step("Revoke test-owned New API login sessions", async () => {
        const cleanupPage = await context.newPage()
        try {
          await cleanupPage.goto(
            `chrome-extension://${extensionId}/account-detection-test.html`,
          )
          const response: NewApiOwnedSessionResponse | undefined =
            await cleanupPage.evaluate(
              (request) => chrome.runtime.sendMessage(request),
              {
                action: NEW_API_OWNED_SESSION_ACTIONS.Cleanup,
                baseUrl: newApiSessionCleanupOrigin,
              },
            )
          if (
            !response?.success ||
            (response.status !== "cleaned" && response.status !== "none")
          ) {
            throw new Error("New API test-owned login session cleanup failed")
          }
          test.info().annotations.push({
            type: "new-api-session-cleanup",
            description: response.status,
          })
        } finally {
          await cleanupPage.close()
        }
      })
    },
    // Leave teardown time even when the original test times out.
    { auto: true, timeout: 60_000 },
  ],
})
