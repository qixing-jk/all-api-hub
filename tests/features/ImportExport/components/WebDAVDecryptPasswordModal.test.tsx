import userEvent from "@testing-library/user-event"
import { expect, it, vi } from "vitest"

import { WebDAVDecryptPasswordModal } from "~/features/ImportExport/components/WebDAVDecryptPasswordModal"
import { render, screen } from "~~/tests/test-utils/render"

it("wraps decrypt actions and keeps both actions interactive", async () => {
  const user = userEvent.setup()
  const onClose = vi.fn()
  const onDecryptAndImport = vi.fn()

  render(
    <WebDAVDecryptPasswordModal
      isOpen
      decrypting={false}
      password="secret"
      onPasswordChange={() => {}}
      savePassword={false}
      onSavePasswordChange={() => {}}
      onClose={onClose}
      onDecryptAndImport={onDecryptAndImport}
    />,
  )

  expect(await screen.findByRole("group")).toHaveClass(
    "flex-wrap",
    "justify-end",
  )

  await user.click(
    screen.getByRole("button", { name: "common:actions.cancel" }),
  )
  await user.click(
    screen.getByRole("button", {
      name: "importExport:webdav.encryption.decryptAction",
    }),
  )

  expect(onClose).toHaveBeenCalledOnce()
  expect(onDecryptAndImport).toHaveBeenCalledOnce()
})
