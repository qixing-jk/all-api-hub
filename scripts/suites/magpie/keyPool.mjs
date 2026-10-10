import { randomUUID } from "node:crypto"
import { expect } from "@playwright/test"

/** Exercise native key identities and preservation through the extension's ordinary form. */
export async function runMagpieKeyPoolScenario({
  page,
  dialog,
  origin,
  native,
  resources,
  runName,
  workspace,
  onCheck,
  onCapture,
}) {
  const name = `${runName} key pool`
  resources.names.add(name)
  const primary = `sk-primary-${randomUUID()}`
  const backup = `sk-backup-${randomUUID()}`
  const spare = `sk-spare-${randomUUID()}`
  const concurrent = `sk-concurrent-${randomUUID()}`
  const chat = `https://${randomUUID()}.example.invalid/v1`
  const pool = dialog.getByRole("group", { name: "Key pool", exact: true })
  const row = (number) =>
    pool.getByRole("group", { name: `API Key ${number}`, exact: true })
  const expand = async (number) => {
    const button = row(number).getByRole("button", {
      name: `Expand API Key ${number}`,
      exact: true,
    })
    if (await button.count()) await button.click()
  }
  const choose = async (scope, label, option) => {
    await scope.getByRole("combobox", { name: label, exact: true }).click()
    await page.getByRole("option", { name: option, exact: true }).click()
  }
  await page.goto(`${origin}#managedSiteChannels`)
  await page.getByRole("button", { name: "Add channel", exact: true }).click()
  await dialog.locator("#channel-name").fill(name)
  await dialog.locator("#channel-key").fill(primary)
  await dialog.getByLabel("Chat Completions URL", { exact: true }).fill(chat)
  expect(
    await dialog
      .locator("#channel-key")
      .evaluate((element) =>
        Boolean(
          element.compareDocumentPosition(
            document.querySelector(
              'input[placeholder="https://api.example.com/v1"]',
            ),
          ) & Node.DOCUMENT_POSITION_FOLLOWING,
        ),
      ),
  ).toBe(true)
  await pool.getByRole("button", { name: "Add key", exact: true }).click()
  await pool.getByTestId("keyPool-secret-input-0").evaluate((element, keys) => {
    const data = new DataTransfer()
    data.setData("text/plain", keys)
    element.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: data,
      }),
    )
  }, `${backup}\n${spare}\n${backup}`)
  await expect(
    pool.locator('[data-testid^="keyPool-secret-input-"]'),
  ).toHaveCount(2)
  await row(1).getByLabel("Key name", { exact: true }).fill("Backup")
  await choose(row(1), "Protocol", "Anthropic")
  await row(1).getByLabel("Weight", { exact: true }).fill("7")
  await expand(2)
  await row(2).getByLabel("Key name", { exact: true }).fill("Spare")
  await row(2).getByRole("switch", { name: "Enabled", exact: true }).click()
  await choose(dialog, "Key routing", "Round robin")
  await onCapture?.("key-pool-create", dialog)
  await dialog
    .getByRole("button", { name: "Create Channel", exact: true })
    .click()
  await expect(dialog).toBeHidden({ timeout: 60_000 })
  const created = await workspace.readCreated(name)
  expect(created.keyList).toHaveLength(3)
  expect(created.routing).toBe("rotate")
  const mainId = created.keyList.find((key) => key.active).id
  const backupId = created.keyList.find((key) => key.name === "Backup").id
  expect(created.keyList.find((key) => key.id === backupId)).toMatchObject({
    on: true,
    protocol: "anthropic",
    weight: 7,
  })
  expect(created.keyList.find((key) => key.name === "Spare").on).toBe(false)
  onCheck(
    "Bulk key creation, deduplication, per-key protocol/weight/status, routing and early key placement",
  )

  await workspace.edit(name)
  for (const width of [1100, 640]) {
    await page.setViewportSize({ width, height: 1000 })
    const typeLabels = dialog
      .getByRole("radiogroup", { name: "API type" })
      .locator("label > span > span:first-child")
    expect(
      await typeLabels.evaluateAll((labels) =>
        labels.every(
          (label) =>
            label.clientHeight <=
            Math.ceil(parseFloat(getComputedStyle(label).lineHeight)),
        ),
      ),
    ).toBe(true)
    await expect(
      row(2).getByRole("switch", { name: "Enabled", exact: true }),
    ).toBeVisible()
    expect(
      await dialog.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true)
    await onCapture?.(`key-pool-list-${width}`, dialog)
  }
  await expand(1)
  await row(1).getByRole("button", { name: "Show key", exact: true }).click()
  await expect(pool.getByTestId("keyPool-secret-input-0")).toHaveValue(primary)
  await expand(2)
  await expect(pool.getByTestId("keyPool-secret-input-0")).not.toBeVisible()
  await expect(
    row(2).getByRole("button", { name: "Show key", exact: true }),
  ).toHaveCount(0)
  await expect(
    row(2).getByText("Only the masked value is available for this saved key."),
  ).toBeVisible()
  await pool.evaluate((element) => element.scrollIntoView({ block: "start" }))
  await onCapture?.("key-pool-edit-640", dialog)
  await page.setViewportSize({ width: 1100, height: 1000 })
  await onCapture?.("key-pool-edit-1100", dialog)
  await expect(pool.getByTestId("keyPool-secret-input-1")).toHaveAttribute(
    "readonly",
    "",
  )
  await expect(pool.getByTestId("keyPool-secret-input-1")).toHaveValue(
    `${backup.slice(0, 4)}••••••${backup.slice(-4)}`,
  )
  // Native edits after opening must survive a targeted pool update.
  await native.save({
    id: created.id,
    name,
    chat,
    models: created.chosen,
    routing: "rotate",
    accountProxies: { [backupId]: "direct" },
  })
  await native.keyAction("add", {
    id: created.id,
    key: concurrent,
    name: "Concurrent",
    protocol: "responses",
  })
  await row(2).getByLabel("Key name", { exact: true }).fill("Renamed backup")
  await choose(row(2), "Protocol", "Chat Completions")
  await row(2).getByLabel("Weight", { exact: true }).fill("3")
  await row(2).getByRole("switch", { name: "Enabled", exact: true }).click()
  await row(3).getByRole("switch", { name: "Enabled", exact: true }).click()
  await row(1).getByRole("button", { name: "Remove key", exact: true }).click()
  await choose(dialog, "Key routing", "Weighted")
  await workspace.save()
  const changed = await workspace.find(created.id)
  expect(changed.keyList).toHaveLength(3)
  expect(changed.keyList.some((key) => key.id === mainId)).toBe(false)
  expect(changed.keyList.find((key) => key.id === backupId)).toMatchObject({
    name: "Renamed backup",
    on: false,
    protocol: "chat",
    weight: 3,
  })
  expect(
    changed.keyList.find((key) => key.name === "Concurrent"),
  ).toMatchObject({ on: true, protocol: "responses" })
  expect(changed.accountProxies[backupId]).toBe("direct")
  expect(changed.keyList.find((key) => key.active).name).toBe("Spare")
  expect(changed.routing).toBe("weight")
  onCheck(
    "Rename/protocol/weight/enable/disable/remove with safe primary promotion and preservation of concurrent keys and per-key proxy",
  )
  onCheck(
    "Compact key inventory, independent inline status, primary reveal and explicit extra-key mask limitation at desktop and narrow widths",
  )

  await workspace.edit(name)
  for (let index = 0; index < changed.keyList.length; index++) {
    if (!changed.keyList[index].on) continue
    await expand(index + 1)
    await row(index + 1)
      .getByRole("switch", { name: "Enabled", exact: true })
      .click()
  }
  await expect(
    dialog.getByRole("button", { name: "Save Changes", exact: true }),
  ).toBeDisabled()
  await expect(dialog.getByText(/Keep at least one enabled key/)).toBeVisible()
  expect((await workspace.find(created.id)).keyList).toEqual(changed.keyList)
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click()
  await expect(dialog).toBeHidden()
  onCheck(
    "Reject disabling every key before dispatch; cancellation leaves the pool unchanged",
  )

  await workspace.edit(name)
  const replacement = `sk-replacement-${randomUUID()}`
  await dialog.locator("#channel-key").fill(replacement)
  await workspace.save()
  expect((await native.key(created.id)) === replacement).toBe(true)
  const replaced = await workspace.find(created.id)
  expect(replaced.keyList.find((key) => key.active).name).toBe("Spare")
  expect(replaced.keyList.filter((key) => !key.active)).toEqual(
    changed.keyList.filter((key) => !key.active),
  )
  onCheck("Primary replacement retains its name and leaves other keys intact")
}
