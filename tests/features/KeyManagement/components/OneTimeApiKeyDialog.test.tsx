import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { act } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { KEY_MANAGEMENT_TEST_IDS } from "~/features/KeyManagement/testIds"

let OneTimeApiKeyDialog: typeof import("~/features/KeyManagement/components/OneTimeApiKeyDialog").OneTimeApiKeyDialog

vi.mock("@headlessui/react", () => {
  const Dialog = ({ children }: any) => <div>{children}</div>
  Dialog.Panel = ({ children, ...props }: any) => (
    <div {...props}>{children}</div>
  )

  const Transition = ({ show, children }: any) =>
    show ? <>{children}</> : null
  Transition.Child = ({ children }: any) => <>{children}</>

  return { Dialog, Transition }
})

describe("OneTimeApiKeyDialog", () => {
  beforeEach(async () => {
    ;({ OneTimeApiKeyDialog } = await import(
      "~/features/KeyManagement/components/OneTimeApiKeyDialog"
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
      screen.queryByTestId(KEY_MANAGEMENT_TEST_IDS.oneTimeKeySaveButton),
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
      screen.getByTestId(KEY_MANAGEMENT_TEST_IDS.oneTimeKeySaveButton),
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
      screen.getByTestId(KEY_MANAGEMENT_TEST_IDS.oneTimeKeySaveButton),
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
      screen.getByTestId(KEY_MANAGEMENT_TEST_IDS.oneTimeKeySaveButton),
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
      KEY_MANAGEMENT_TEST_IDS.oneTimeKeySaveButton,
    )

    await user.dblClick(saveButton)

    expect(onSave).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveSave?.()
    })
  })
})
