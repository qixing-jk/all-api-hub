import { act, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { expect, it, vi } from "vitest"

import { presentDetachedOneTimeSecret } from "~/features/TokenProvisioning/components/DetachedOneTimeSecretDialog"
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
