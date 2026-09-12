import { randomUUID } from "node:crypto"
import { isDeepStrictEqual } from "node:util"
import type { BrowserContext, Page } from "@playwright/test"

import { CHANNEL_DIALOG_TEST_IDS } from "~/components/dialogs/ChannelDialog/testIds"
import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { MANAGED_SITE_CHANNELS_TEST_IDS } from "~/features/ManagedSiteChannels/testIds"
import type { NewApiConfig } from "~/types/newApiConfig"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import { openManagedSiteChannelRowActions } from "~~/e2e/scenarios/managedSiteChannels"
import { runScenarioWithCleanup } from "~~/e2e/utils/scenarioErrors"

/** Verify UI edits against a live server using only a run-owned, nonfunctional channel. */
export async function runNewApiMultiKeyRealSiteScenario(params: {
  context: BrowserContext
  page: Page
  extensionId: string
  config: NewApiConfig
}) {
  const { context, page, extensionId, config } = params
  page.setDefaultTimeout(15_000)
  let secretReads = 0
  let verifications = 0
  context.on("request", (request) => {
    const url = new URL(request.url())
    if (url.origin !== new URL(config.baseUrl).origin) return
    if (/\/api\/channel\/\d+\/key$/.test(url.pathname)) secretReads++
    if (url.pathname === "/api/verify") verifications++
  })
  const name = `AAH E2E NewAPI MultiKey ${randomUUID()}`
  const keys = [1, 2, 3, 4].map(
    (index) => `sk-aah-nonfunctional-${randomUUID()}-${index}`,
  )
  const request = async (path: string, method = "GET", data?: unknown) => {
    let response
    try {
      response = await context.request.fetch(
        `${config.baseUrl.replace(/\/$/, "")}${path}`,
        {
          method,
          maxRedirects: 0,
          timeout: 30_000,
          headers: {
            Authorization: `Bearer ${config.adminToken}`,
            "New-Api-User": config.userId,
          },
          data,
        },
      )
    } catch {
      throw new Error(`New API multi-key ${method} request failed`)
    }
    if (!response.ok())
      throw new Error(`New API multi-key HTTP ${response.status()}`)
    const body = await response.json()
    if (body.success !== true)
      throw new Error(`New API multi-key ${method} rejected`)
    return body.data
  }
  const findOwned = async (): Promise<Array<{ id: number; name: string }>> => {
    const result = await request(
      `/api/channel/search?keyword=${encodeURIComponent(name)}`,
    )
    const items = Array.isArray(result) ? result : result?.items
    if (!Array.isArray(items))
      throw new Error("Unexpected New API channel search response")
    return items.filter(
      (item) =>
        item.name === name && Number.isSafeInteger(item.id) && item.id > 0,
    )
  }
  const dialog = page.getByRole("dialog")
  const row = (number: number) =>
    dialog.getByRole("group", { name: `API Key ${number}`, exact: true })
  const open = async () => {
    await page.goto(
      `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.MANAGED_SITE_CHANNELS}`,
    )
    await page
      .getByTestId(MANAGED_SITE_CHANNELS_TEST_IDS.searchInput)
      .fill(name)
    await openManagedSiteChannelRowActions(page, name)
    await page.getByRole("menuitem", { name: "Edit", exact: true }).click()
    // Saved login-assist credentials drive the extension's normal verification flow.
    const addKey = dialog.getByRole("button", { name: "Add key", exact: true })
    const verification = dialog.getByRole("button", {
      name: "Submit verification code",
      exact: true,
    })
    await expect(addKey.or(verification)).toBeVisible({ timeout: 45_000 })
    if (await verification.isVisible())
      throw new Error(
        "New API administrator verification failed; check ADMIN_USERNAME, ADMIN_PASSWORD, and ADMIN_TOTP_SECRET for the configured ADMIN_USER_ID",
      )
  }
  await runScenarioWithCleanup({
    run: async () => {
      await request("/api/channel/", "POST", {
        mode: "multi_to_single",
        multi_key_mode: "random",
        channel: {
          name,
          type: 1,
          status: 2,
          key: keys.slice(0, 3).join("\n"),
          base_url: "https://aah-e2e.example.invalid",
          models: `aah-e2e-${randomUUID()}`,
          group: "default",
          priority: 7,
          weight: 3,
          auto_ban: 0,
          model_mapping: "{}",
          status_code_mapping: '{"418":"429"}',
        },
      })
      const owned = await findOwned()
      expect(owned.length).toBe(1)
      const id = owned[0].id
      await request("/api/channel/multi_key/manage", "POST", {
        channel_id: id,
        action: "disable_key",
        key_index: 0,
      })
      const before = await request(`/api/channel/${id}`)
      expect(before.channel_info?.is_multi_key).toBe(true)
      await test.step("Edit key membership, key status, and selection mode through the UI", async () => {
        await open()
        await expect(
          dialog.getByRole("group", { name: /^API Key \d+$/ }),
        ).toHaveCount(3)
        await row(1).getByRole("button", { name: /Key 1/ }).click()
        await row(1)
          .getByRole("switch", { name: "Enable this key", exact: true })
          .check()
        await row(1)
          .getByLabel("API Key 1", { exact: true })
          .fill(`${keys[0]}-rotated`)
        await row(2)
          .getByRole("button", { name: "Remove key", exact: true })
          .click()
        await dialog
          .getByRole("button", { name: "Add key", exact: true })
          .click()
        await row(3).getByLabel("API Key 3", { exact: true }).fill(keys[3])
        await row(3)
          .getByRole("switch", { name: "Enable this key", exact: true })
          .uncheck()
        await dialog
          .getByRole("combobox", { name: "Key selection", exact: true })
          .click()
        await page
          .getByRole("option", { name: "Round robin", exact: true })
          .click()
        await dialog.getByTestId(CHANNEL_DIALOG_TEST_IDS.submitButton).click()
        await expect(dialog).toBeHidden({ timeout: 30_000 })
        expect(secretReads).toBe(0)
        expect(verifications).toBe(0)
      })
      await test.step("Read actual server state and reveal the saved keys after reopening", async () => {
        const after = await request(`/api/channel/${id}`)
        expect(after.channel_info.multi_key_size).toBe(3)
        expect(after.channel_info.multi_key_mode).toBe("polling")
        expect(
          [0, 1, 2].map(
            (index) => after.channel_info.multi_key_status_list?.[index] ?? 1,
          ),
        ).toEqual([1, 1, 2])
        const changed = Object.keys(before).filter(
          (field) =>
            !["key", "channel_info", "updated_at", "updatedAt"].includes(
              field,
            ) && !isDeepStrictEqual(before[field], after[field]),
        )
        expect(changed, "Unedited channel fields preserved").toEqual([])
        if (!config.username || !config.password || !config.totpSecret) {
          test.info().annotations.push({
            type: "disclosure-not-tested",
            description:
              "Native save/readback verified; secret reveal and in-place editing need administrator login and TOTP credentials.",
          })
          return
        }
        await open()
        const expected = [keys[2], `${keys[0]}-rotated`, keys[3]]
        for (let index = 0; index < expected.length; index++) {
          const item = row(index + 1)
          await item
            .getByRole("button", { name: new RegExp(`Key ${index + 1}`) })
            .click()
          await item
            .getByRole("button", { name: "Show key", exact: true })
            .click()
          await expect
            .poll(
              async () =>
                (await item
                  .getByLabel(`API Key ${index + 1}`, { exact: true })
                  .inputValue()) === expected[index],
              { message: "Saved key matches the expected value" },
            )
            .toBe(true)
        }
        await expect(
          row(3).getByRole("switch", { name: "Enable this key", exact: true }),
        ).not.toBeChecked()
        expect(secretReads).toBe(1)
        await row(2)
          .getByLabel("API Key 2", { exact: true })
          .fill(`${expected[1]}-again`)
        await dialog.getByTestId(CHANNEL_DIALOG_TEST_IDS.submitButton).click()
        await expect(dialog).toBeHidden({ timeout: 30_000 })
        expect(secretReads).toBe(1)
        await open()
        await row(2).getByRole("button", { name: /Key 2/ }).click()
        await row(2)
          .getByRole("button", { name: "Show key", exact: true })
          .click()
        await expect
          .poll(
            async () =>
              (await row(2)
                .getByLabel("API Key 2", { exact: true })
                .inputValue()) === `${expected[1]}-again`,
          )
          .toBe(true)
        expect(secretReads).toBe(2)
        await dialog.getByTestId(CHANNEL_DIALOG_TEST_IDS.cancelButton).click()
      })
    },
    finalizers: [
      async () => {
        for (const channel of await findOwned())
          await request(`/api/channel/${channel.id}`, "DELETE")
        expect(
          (await findOwned()).length,
          "Temporary New API channel cleaned up",
        ).toBe(0)
      },
    ],
    cleanupMessage: "New API multi-key cleanup failed",
    failureMessage: "New API multi-key real-site verification failed",
  })
}
