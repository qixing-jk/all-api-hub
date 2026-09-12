import { isDeepStrictEqual } from "node:util"
import type { Page } from "@playwright/test"

import { CHANNEL_DIALOG_TEST_IDS } from "~/components/dialogs/ChannelDialog/testIds"
import { SITE_TYPES } from "~/constants/siteType"
import { expect } from "~~/e2e/fixtures/extensionTest"
import { openManagedSiteChannelRowActions } from "~~/e2e/scenarios/managedSiteChannels"
import {
  assertManagedChannelPreserved,
  captureManagedChannelSnapshot,
} from "~~/e2e/utils/realSite/managedChannelPreservation"

/** Exercise the same UI and native readback on intercepted and live deployments. */
export async function runManagedMultiKeyEditorScenario(params: {
  page: Page
  siteType: typeof SITE_TYPES.AXON_HUB | typeof SITE_TYPES.OCTOPUS
  baseUrl: string
  name: string
  keys: readonly string[]
}) {
  const { page } = params
  const dialog = page.getByRole("dialog")
  const row = (number: number) =>
    dialog.getByRole("group", { name: `API Key ${number}`, exact: true })
  const open = () =>
    captureManagedChannelSnapshot({
      ...params,
      read: async () => {
        await openManagedSiteChannelRowActions(page, params.name)
        await page.getByRole("menuitem", { name: "Edit", exact: true }).click()
        await expect(
          dialog.getByRole("button", { name: "Add key", exact: true }),
        ).toBeVisible()
      },
    })
  const before = await open()
  const nativeKeys = (snapshot: Record<string, unknown>) =>
    params.siteType === SITE_TYPES.AXON_HUB
      ? (snapshot.credentials as { apiKeys: string[] }).apiKeys
      : (snapshot.keys as Array<{ key?: string; channel_key?: string }>).map(
          (key) => key.key ?? key.channel_key,
        )
  expect(
    isDeepStrictEqual(nativeKeys(before), params.keys),
    "Created keys persisted",
  ).toBe(true)
  await expect(
    dialog.getByRole("group", { name: /^API Key \d+$/ }),
  ).toHaveCount(3)
  await row(2).getByRole("button", { name: "Remove key", exact: true }).click()
  await row(2).getByRole("button", { name: /Key 2/ }).click()
  const replacement = `${params.keys[2]}-rotated`
  await row(2).getByLabel("API Key 2", { exact: true }).fill(replacement)
  const named =
    (await row(2)
      .getByRole("textbox", { name: "Channel Name", exact: true })
      .count()) > 0
  if (named)
    await row(2)
      .getByRole("textbox", { name: "Channel Name", exact: true })
      .fill("third-renamed")
  await dialog.getByRole("button", { name: "Add key", exact: true }).click()
  const added = `${params.keys[2]}-added`
  await row(3).getByLabel("API Key 3", { exact: true }).fill(added)
  if (params.siteType === SITE_TYPES.OCTOPUS) {
    await row(3)
      .getByRole("switch", { name: "Enable this key", exact: true })
      .uncheck()
    await row(3)
      .getByRole("textbox", {
        name: named ? "Channel Name" : "Remark",
        exact: true,
      })
      .fill(named ? "fourth" : "added-note")
  }
  await dialog.getByTestId(CHANNEL_DIALOG_TEST_IDS.submitButton).click()
  await expect(dialog).toBeHidden({ timeout: 30_000 })
  const after = await open()
  expect(
    isDeepStrictEqual(
      [...nativeKeys(after)].sort(),
      [params.keys[0], replacement, added].sort(),
    ),
    "Saved keys match after a new server read",
  ).toBe(true)
  const firstIndex = nativeKeys(after).indexOf(params.keys[0])
  const rotatedIndex = nativeKeys(after).indexOf(replacement)
  const addedIndex = nativeKeys(after).indexOf(added)
  const withoutKeys = (snapshot: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(snapshot).filter(
        ([key]) => !["keys", "credentials", "grants"].includes(key),
      ),
    )
  assertManagedChannelPreserved(
    params.siteType,
    withoutKeys(before),
    withoutKeys(after),
  )
  if (params.siteType === SITE_TYPES.AXON_HUB) {
    const omitApiKeys = (value: unknown) =>
      Object.fromEntries(
        Object.entries(value as Record<string, unknown>).filter(
          ([key]) => !["apiKey", "apiKeys"].includes(key),
        ),
      )
    expect(
      isDeepStrictEqual(
        omitApiKeys(before.credentials),
        omitApiKeys(after.credentials),
      ),
      "Other credential settings preserved",
    ).toBe(true)
  }
  if (params.siteType === SITE_TYPES.OCTOPUS) {
    const omitEditedKeyFields = (value: unknown) =>
      Object.fromEntries(
        Object.entries(value as Record<string, unknown>).filter(
          ([key]) =>
            !["key", "channel_key", "name", "enabled", "remark"].includes(key),
        ),
      )
    const original = before.keys as unknown[]
    const saved = after.keys as unknown[]
    expect(
      isDeepStrictEqual(
        omitEditedKeyFields(original[0]),
        omitEditedKeyFields(saved[firstIndex]),
      ),
      "First key metadata preserved",
    ).toBe(true)
    expect(
      isDeepStrictEqual(
        omitEditedKeyFields(original[2]),
        omitEditedKeyFields(saved[rotatedIndex]),
      ),
      "Rotated key metadata preserved",
    ).toBe(true)
    const keys = after.keys as Array<{
      enabled: boolean
      name?: string
      remark?: string
    }>
    expect([
      keys[firstIndex].enabled,
      keys[rotatedIndex].enabled,
      keys[addedIndex].enabled,
    ]).toEqual([true, true, false])
    if (named) {
      expect([keys[rotatedIndex].name, keys[addedIndex].name]).toEqual([
        "third-renamed",
        "fourth",
      ])
      const oldKeys = before.keys as Array<{ name: string }>
      const oldGrants = before.grants as Array<{ key_name: string }>
      const surviving = oldGrants
        .filter((grant) => grant.key_name !== oldKeys[1].name)
        .map((grant) => ({
          ...grant,
          key_name:
            grant.key_name === oldKeys[2].name
              ? "third-renamed"
              : grant.key_name,
        }))
      const grants = after.grants as Array<{ key_name: string }>
      expect(
        isDeepStrictEqual(
          grants
            .filter((grant) => grant.key_name !== "fourth")
            .map((grant) => JSON.stringify(grant))
            .sort(),
          surviving.map((grant) => JSON.stringify(grant)).sort(),
        ),
        "Surviving model grants preserved",
      ).toBe(true)
      expect(grants.some((grant) => grant.key_name === "fourth")).toBe(true)
    } else expect(keys[addedIndex].remark).toBe("added-note")
  }
  await row(rotatedIndex + 1)
    .getByRole("button", { name: new RegExp(`Key ${rotatedIndex + 1}`) })
    .click()
  await row(rotatedIndex + 1)
    .getByRole("button", { name: "Show key", exact: true })
    .click()
  await expect
    .poll(
      async () =>
        (await row(rotatedIndex + 1)
          .getByLabel(`API Key ${rotatedIndex + 1}`, { exact: true })
          .inputValue()) === replacement,
    )
    .toBe(true)
  await dialog.getByTestId(CHANNEL_DIALOG_TEST_IDS.cancelButton).click()
}
