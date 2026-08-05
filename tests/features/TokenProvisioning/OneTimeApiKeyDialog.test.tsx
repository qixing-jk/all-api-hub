import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { act } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { TOKEN_PROVISIONING_TEST_IDS } from "~/features/TokenProvisioning/testIds"

let OneTimeApiKeyDialog: typeof import("~/features/TokenProvisioning/components/OneTimeApiKeyDialog").OneTimeApiKeyDialog

const createDeferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>((nextResolve) => {
    resolve = nextResolve
  })
  return { promise, resolve }
}

describe("OneTimeApiKeyDialog", () => {
  beforeEach(async () => {
    ;({ OneTimeApiKeyDialog } = await import(
      "~/features/TokenProvisioning/components/OneTimeApiKeyDialog"
    ))
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    })
  })

  it("renders the save button only when a save action is provided", () => {
    const token = {
      key: "sk-one-time",
      name: "Default API Key",
    } as any

    const { rerender } = render(
      <OneTimeApiKeyDialog
        isOpen={true}
        token={token}
        onClose={vi.fn()}
        autoCopy={false}
      />,
    )

    expect(
      screen.queryByTestId(TOKEN_PROVISIONING_TEST_IDS.oneTimeKeySaveButton),
    ).not.toBeInTheDocument()

    rerender(
      <OneTimeApiKeyDialog
        isOpen={true}
        token={token}
        onClose={vi.fn()}
        autoCopy={false}
        saveAction={{
          onSave: vi.fn(),
        }}
      />,
    )

    expect(
      screen.getByTestId(TOKEN_PROVISIONING_TEST_IDS.oneTimeKeySaveButton),
    ).toBeInTheDocument()
  })

  it("keeps the dialog open when the save action fails", async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onSave = vi.fn().mockRejectedValue(new Error("storage failed"))

    render(
      <OneTimeApiKeyDialog
        isOpen={true}
        token={{ key: "sk-one-time", name: "Default API Key" } as any}
        onClose={onClose}
        autoCopy={false}
        saveAction={{ onSave }}
      />,
    )

    await user.click(
      screen.getByTestId(TOKEN_PROVISIONING_TEST_IDS.oneTimeKeySaveButton),
    )

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
  })

  it("keeps the dialog open after a successful save action", async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onSave = vi.fn().mockResolvedValue(undefined)

    render(
      <OneTimeApiKeyDialog
        isOpen={true}
        token={{ key: "sk-one-time", name: "Default API Key" } as any}
        onClose={onClose}
        autoCopy={false}
        saveAction={{ onSave }}
      />,
    )

    await user.click(
      screen.getByTestId(TOKEN_PROVISIONING_TEST_IDS.oneTimeKeySaveButton),
    )

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
  })

  it("prevents duplicate save submissions while a save is in flight", async () => {
    const user = userEvent.setup()
    let resolveSave: (() => void) | undefined
    const onSave = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSave = resolve
        }),
    )

    render(
      <OneTimeApiKeyDialog
        isOpen={true}
        token={{ key: "sk-one-time", name: "Default API Key" } as any}
        onClose={vi.fn()}
        autoCopy={false}
        saveAction={{ onSave }}
      />,
    )

    const saveButton = screen.getByTestId(
      TOKEN_PROVISIONING_TEST_IDS.oneTimeKeySaveButton,
    )

    await user.dblClick(saveButton)

    expect(onSave).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveSave?.()
    })
  })

  it("does not repeat pending auto-copy when a parent recreates the token", async () => {
    const pendingCopy = createDeferred()
    const writeText = vi.fn(() => pendingCopy.promise)
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    })
    const token = { key: "sk-one-time", name: "Default API Key" } as any
    const { rerender } = render(
      <OneTimeApiKeyDialog isOpen={true} token={token} onClose={vi.fn()} />,
    )
    expect(writeText).toHaveBeenCalledOnce()

    rerender(
      <OneTimeApiKeyDialog
        isOpen={true}
        token={{ ...token }}
        onClose={vi.fn()}
      />,
    )
    expect(writeText).toHaveBeenCalledOnce()

    await act(async () => {
      pendingCopy.resolve()
    })
  })

  it("preserves the pending save guard when a parent recreates the token", async () => {
    const user = userEvent.setup()
    const pendingSave = createDeferred()
    const onSave = vi.fn(() => pendingSave.promise)
    const token = { key: "sk-one-time", name: "Default API Key" } as any
    const { rerender } = render(
      <OneTimeApiKeyDialog
        isOpen={true}
        token={token}
        onClose={vi.fn()}
        autoCopy={false}
        saveAction={{ onSave }}
      />,
    )
    await user.click(
      screen.getByTestId(TOKEN_PROVISIONING_TEST_IDS.oneTimeKeySaveButton),
    )

    rerender(
      <OneTimeApiKeyDialog
        isOpen={true}
        token={{ ...token }}
        onClose={vi.fn()}
        autoCopy={false}
        saveAction={{ onSave }}
      />,
    )
    await user.click(
      screen.getByTestId(TOKEN_PROVISIONING_TEST_IDS.oneTimeKeySaveButton),
    )
    expect(onSave).toHaveBeenCalledOnce()

    await act(async () => {
      pendingSave.resolve()
    })
  })
})
