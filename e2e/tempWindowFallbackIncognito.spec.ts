import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  forceExtensionLanguage,
  installExtensionPageGuards,
} from "~~/e2e/utils/commonUserFlows"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

const ORIGIN_URL = "https://incognito-fallback.example.test"
const FETCH_URL = `${ORIGIN_URL}/api/user/self`

test.beforeEach(async ({ page }) => {
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "en")
})

test("rejects incognito temp-window fallback without opening a normal temporary context", async ({
  context,
  extensionId,
  page,
}) => {
  await page.goto(`chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}`)
  await waitForExtensionRoot(page)

  const pagesBefore = context.pages()
  const response = await page.evaluate(
    async ({ action, fetchUrl, originUrl }) => {
      return await new Promise<unknown>((resolve, reject) => {
        chrome.runtime.sendMessage(
          {
            action,
            originUrl,
            fetchUrl,
            fetchOptions: { method: "GET" },
            requestId: "e2e-incognito-temp-window-fallback",
            useIncognito: true,
          },
          (result) => {
            const error = chrome.runtime.lastError
            if (error) {
              reject(new Error(error.message))
              return
            }
            resolve(result)
          },
        )
      })
    },
    {
      action: RuntimeActionIds.TempWindowFetch,
      originUrl: ORIGIN_URL,
      fetchUrl: FETCH_URL,
    },
  )

  expect(response).toMatchObject({
    success: false,
    error:
      'Incognito access is required to use a private temporary window. Please enable "Allow in incognito" for this extension and retry.',
  })

  expect(context.pages()).toHaveLength(pagesBefore.length)
})
