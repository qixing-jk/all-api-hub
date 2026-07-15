import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"

import { AihubmixDefaultKeyPromptDialog } from "~/features/AccountManagement/components/AccountDialog/AihubmixDefaultKeyPromptDialog"
import { act, render, screen, waitFor } from "~~/tests/test-utils/render"

const createDeferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>((promiseResolve) => {
    resolve = promiseResolve
  })
  return { promise, resolve }
}

function PromptHarness({
  onCancel,
  onCreate,
}: {
  onCancel: () => void
  onCreate: () => Promise<void>
}) {
  const [isCreating, setIsCreating] = useState(false)

  const handleConfirm = async () => {
    setIsCreating(true)
    try {
      await onCreate()
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <AihubmixDefaultKeyPromptDialog
      isOpen={true}
      accountName="Example Account"
      isCreating={isCreating}
      onCancel={onCancel}
      onConfirm={() => void handleConfirm()}
    />
  )
}

describe("AihubmixDefaultKeyPromptDialog", () => {
  it("marks only default-key creation as busy and suppresses duplicate confirmation", async () => {
    const user = userEvent.setup()
    const createDeferredRequest = createDeferred()
    const onCreate = vi.fn().mockReturnValue(createDeferredRequest.promise)
    const onCancel = vi.fn()

    render(<PromptHarness onCancel={onCancel} onCreate={onCreate} />)

    await user.click(
      await screen.findByRole("button", {
        name: "accountDialog:aihubmixDefaultKeyPrompt.confirm",
      }),
    )

    const creatingButton = screen.getByRole("button", {
      name: "accountDialog:aihubmixDefaultKeyPrompt.creating",
    })
    expect(creatingButton).toHaveAttribute("aria-busy", "true")
    expect(creatingButton).toBeDisabled()

    const cancelButton = screen.getByRole("button", {
      name: "accountDialog:aihubmixDefaultKeyPrompt.cancel",
    })
    expect(cancelButton).toBeDisabled()
    expect(cancelButton).not.toHaveAttribute("aria-busy")

    await user.click(creatingButton)
    await user.click(cancelButton)
    expect(onCreate).toHaveBeenCalledTimes(1)
    expect(onCancel).not.toHaveBeenCalled()

    await act(async () => {
      createDeferredRequest.resolve()
    })

    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: "accountDialog:aihubmixDefaultKeyPrompt.confirm",
        }),
      ).toBeEnabled()
    })
  })
})
