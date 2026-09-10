import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import { waitForExtensionPage } from "~~/e2e/utils/commonUserFlows"

for (const initiallyOpen of [false, true]) {
  test(`waits for ${initiallyOpen ? "an existing" : "a new"} blank extension tab to reach its destination`, async ({
    context,
    extensionId,
  }) => {
    const params = {
      extensionId,
      path: OPTIONS_PAGE_PATH,
      hash: `#${MENU_ITEM_IDS.ABOUT}`,
      searchParams: { navigationTest: "delayed-destination" },
    }
    const existingPage = initiallyOpen ? await context.newPage() : null
    const destination = new URL(
      `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}`,
    )
    destination.hash = params.hash
    destination.search = new URLSearchParams(params.searchParams).toString()

    const targetPagePromise = waitForExtensionPage(context, params)
    const targetPage = existingPage ?? (await context.newPage())
    await targetPage.goto(destination.href)

    expect(await targetPagePromise).toBe(targetPage)
  })
}

test("reuses an already matching extension tab", async ({
  context,
  extensionId,
}) => {
  const existingPage = await context.newPage()
  await existingPage.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.ABOUT}`,
  )

  const targetPage = await waitForExtensionPage(context, {
    extensionId,
    path: OPTIONS_PAGE_PATH,
    hash: `#${MENU_ITEM_IDS.ABOUT}`,
  })

  expect(targetPage).toBe(existingPage)
})

test("waits for a new matching tab when existing-tab reuse is disabled", async ({
  context,
  extensionId,
}) => {
  const destination = `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.ABOUT}`
  const existingPage = await context.newPage()
  await existingPage.goto(destination)

  const targetPagePromise = waitForExtensionPage(context, {
    extensionId,
    path: OPTIONS_PAGE_PATH,
    hash: `#${MENU_ITEM_IDS.ABOUT}`,
    reuseExistingPage: false,
  })
  const newPage = await context.newPage()
  await newPage.goto(destination)

  expect(await targetPagePromise).toBe(newPage)
})
