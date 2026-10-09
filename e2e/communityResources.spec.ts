import { readFile } from "node:fs/promises"

import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  forceExtensionLanguage,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"

test("community images use bundled resources first offline and persist successful remote bytes across reloads", async ({
  context,
  page,
  extensionId,
}) => {
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  let online = false
  let catalogRequests = 0
  let imageRequests = 0
  let remoteImageRequests = 0
  const imageBytes = await readFile("resources/wechat_group.png")
  const imageUrl = "https://community.example.test/wechat.png"
  await context.route(
    "https://raw.githubusercontent.com/qixing-jk/all-api-hub/main/public/community-resources.v1.json",
    (route) => {
      catalogRequests += 1
      return online
        ? route.fulfill({
            json: {
              schemaVersion: 1,
              channels: [{ id: "wechat", qrCode: { url: imageUrl } }],
            },
          })
        : route.abort("internetdisconnected")
    },
  )
  await context.route(
    "https://raw.githubusercontent.com/qixing-jk/all-api-hub/main/resources/wechat_group.png*",
    (route) => {
      imageRequests += 1
      return route.abort("internetdisconnected")
    },
  )
  await context.route(`${imageUrl}*`, (route) => {
    imageRequests += 1
    remoteImageRequests += 1
    return online
      ? route.fulfill({ contentType: "image/png", body: imageBytes })
      : route.abort("internetdisconnected")
  })
  await page.goto(`chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}`)
  await expect.poll(() => catalogRequests).toBeGreaterThan(0)
  expect(imageRequests).toBe(0)

  const openCommunity = () =>
    page.getByTestId("sidebar-footer-community").click()
  const openWechat = () =>
    page.getByRole("button", { name: "WeChat group", exact: true }).click()
  const preview = page.getByRole("dialog", {
    name: "WeChat group",
    exact: true,
  })
  const image = preview.getByRole("img", { name: "WeChat group", exact: true })
  const expectDecodedImage = async () => {
    await expect(image).toBeVisible()
    await expect
      .poll(() =>
        image.evaluate(
          (element: HTMLImageElement) =>
            element.complete && element.naturalWidth > 0,
        ),
      )
      .toBe(true)
  }

  await openCommunity()
  await expect(
    page.getByRole("button", { name: "Telegram", exact: true }),
  ).toBeVisible()
  await expect(page.getByRole("dialog").getByRole("status")).toHaveCount(0)
  await page
    .getByRole("dialog")
    .screenshot({ path: test.info().outputPath("community-menu.png") })
  await expect.poll(() => imageRequests).toBeGreaterThan(0)
  await openWechat()
  await expectDecodedImage()
  expect(
    await image.evaluate(
      (element: HTMLImageElement) => new URL(element.src).origin,
    ),
  ).toBe(`chrome-extension://${extensionId}`)
  await expect(preview.getByRole("status")).toHaveCount(0)
  await preview.getByRole("button", { name: "Close", exact: true }).click()

  online = true
  await openCommunity()
  await expect(
    page.getByRole("button", { name: "WeChat group", exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Telegram", exact: true }),
  ).toHaveCount(0)
  await expect.poll(() => remoteImageRequests).toBe(1)
  await openWechat()
  await expectDecodedImage()
  await expect(image).toHaveAttribute("src", /^blob:/)
  await expect(preview.getByRole("status")).toHaveCount(0)
  expect(remoteImageRequests).toBe(1)

  const helpText =
    "Group invite expired or group full? Scan the personal QR code in the image to add the contact and ask for an invitation, or visit the community page."
  const help = preview.getByText(helpText, { exact: true })
  await help.click({ clickCount: 3 })
  await expect
    .poll(() => page.evaluate(() => window.getSelection()?.toString().trim()))
    .toBe(helpText)
  await expect(help).toHaveCSS("cursor", "auto")
  await expect(preview).toBeVisible()
  await preview
    .getByText("Click anywhere to close", { exact: true })
    .click({ clickCount: 3 })
  await expect
    .poll(() => page.evaluate(() => window.getSelection()?.toString().trim()))
    .toBe("Click anywhere to close")
  await expect(preview).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(preview).toBeHidden()
  await openCommunity()
  await openWechat()
  await preview.click({ position: { x: 5, y: 5 } })
  await expect(preview).toBeHidden()

  online = false
  await context.setOffline(true)
  await page.reload()
  await openCommunity()
  await expect(
    page.getByRole("button", { name: "WeChat group", exact: true }),
  ).toBeVisible()
  await expect(page.getByRole("dialog").getByRole("status")).toHaveCount(0)
  await expect(
    page.getByRole("button", { name: "Telegram", exact: true }),
  ).toHaveCount(0)
  await openWechat()
  await expectDecodedImage()
  await expect(image).toHaveAttribute("src", /^blob:/)
  await expect(preview.getByRole("status")).toHaveCount(0)
  await expect(
    preview.getByRole("button", { name: "Open community page", exact: true }),
  ).toBeVisible()
})
