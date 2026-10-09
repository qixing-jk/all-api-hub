import { act, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { expect, it, vi } from "vitest"

import { presentDetachedOneTimeSecret } from "~/features/TokenProvisioning/secretDelivery/DetachedOneTimeSecretDialog"
import common from "~/locales/en/common.json"
import keyManagement from "~/locales/en/keyManagement.json"
import { createResourceTestI18n } from "~~/tests/test-utils/i18n"

it("keeps the real secret dialog localized and saves only on explicit user action before disposing its owner", async () => {
  const user = userEvent.setup()
  const save = vi.fn().mockResolvedValue(undefined)
  const i18n = await createResourceTestI18n(
    { en: { common, keyManagement } },
    "en",
  )
  const hostsBefore = document.body.children.length
  await act(async () => {
    presentDetachedOneTimeSecret(
      {
        result: {
          displayName: "Interrupted creation",
          secret: "sk-detached-example",
        },
        autoCopy: false,
        saveAction: { label: "Save recovered key", onSave: save },
      },
      i18n,
    )
  })
  const dialog = await screen.findByRole("dialog", {
    name: "Save the full key now",
  })
  expect(save).not.toHaveBeenCalled()
  expect(within(dialog).getByDisplayValue("sk-detached-example")).toBeVisible()
  await user.click(
    within(dialog).getAllByRole("button", { name: "Close" }).at(-1)!,
  )
  expect(dialog).toBeVisible()
  await user.click(screen.getByRole("button", { name: "Return to the key" }))
  expect(within(dialog).getByDisplayValue("sk-detached-example")).toBeVisible()
  await user.click(
    within(dialog).getByRole("button", { name: "Save recovered key" }),
  )
  expect(save).toHaveBeenCalledOnce()
  await user.click(
    within(dialog).getAllByRole("button", { name: "Close" }).at(-1)!,
  )
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  )
  expect(document.body.children).toHaveLength(hostsBefore)
})

it("requires an explicit irreversible-loss confirmation to discard a detached secret", async () => {
  const user = userEvent.setup()
  const i18n = await createResourceTestI18n(
    { en: { common, keyManagement } },
    "en",
  )
  const hostsBefore = document.body.children.length
  await act(async () => {
    presentDetachedOneTimeSecret(
      {
        result: {
          displayName: "Discarded example",
          secret: "sk-discard-example",
        },
        autoCopy: false,
      },
      i18n,
    )
  })
  const dialog = await screen.findByRole("dialog", {
    name: "Save the full key now",
  })
  await user.click(
    within(dialog).getAllByRole("button", { name: "Close" }).at(-1)!,
  )
  expect(dialog).toBeVisible()
  expect(
    screen.getByRole("dialog", {
      name: "The full key cannot be viewed again after closing",
    }),
  ).toBeVisible()
  await user.click(screen.getByRole("button", { name: "Close anyway" }))
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  )
  expect(document.body.children).toHaveLength(hostsBefore)
})
