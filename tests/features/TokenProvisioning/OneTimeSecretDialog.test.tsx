import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { act, useState } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { Modal } from "~/components/ui/Dialog/Modal"
import { SITE_TYPES } from "~/constants/siteType"
import { OneTimeSecretDialog } from "~/features/TokenProvisioning/components/OneTimeSecretDialog"
import { TOKEN_PROVISIONING_TEST_IDS } from "~/features/TokenProvisioning/testIds"
import { createAIHubMixCreatedRuntimeSecret } from "~/services/apiAdapters/aihubmix/createdSecret"

const RESULT = {
  displayName: "Example key",
  secret: "sk-example-secret",
}

const createDeferred = <T,>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve
  })
  return { promise, resolve }
}

describe("OneTimeSecretDialog", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    })
  })

  it("asks before closing an unhandled secret and only closes after confirmation", async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <OneTimeSecretDialog
        isOpen={true}
        result={RESULT}
        onClose={onClose}
        autoCopy={false}
      />,
    )

    await user.click(
      screen.getByTestId(TOKEN_PROVISIONING_TEST_IDS.oneTimeKeyCloseButton),
    )

    expect(onClose).not.toHaveBeenCalled()
    expect(
      screen.getByText("keyManagement:oneTimeKey.closeConfirm.title"),
    ).toBeInTheDocument()

    await user.click(
      screen.getByTestId(
        TOKEN_PROVISIONING_TEST_IDS.oneTimeKeyConfirmCloseButton,
      ),
    )

    expect(onClose).toHaveBeenCalledExactlyOnceWith()
  })

  it("renders a fresh AIHubMix create result through the common secret dialog", () => {
    const result = createAIHubMixCreatedRuntimeSecret({
      account: {
        id: "aihubmix-account-example",
        name: "AIHubMix",
        siteType: SITE_TYPES.AIHUBMIX,
        tagIds: [],
      },
      token: {
        name: "Example key",
        full_key: "sk-aihubmix-created-secret",
      },
    })

    render(
      <OneTimeSecretDialog
        isOpen={true}
        result={result}
        onClose={vi.fn()}
        autoCopy={false}
      />,
    )

    expect(
      screen.getByLabelText("keyManagement:oneTimeKey.keyLabel"),
    ).toHaveValue("sk-aihubmix-created-secret")
    expect(
      screen.getByTestId(TOKEN_PROVISIONING_TEST_IDS.oneTimeKeyInput),
    ).toHaveValue("sk-aihubmix-created-secret")
    expect(
      screen.getByTestId(TOKEN_PROVISIONING_TEST_IDS.oneTimeKeyCopyButton),
    ).toBeVisible()
  })

  it("closes immediately after a successful copy but not a failed copy", async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onCopyResult = vi.fn()
    render(
      <OneTimeSecretDialog
        isOpen={true}
        result={RESULT}
        onClose={onClose}
        autoCopy={false}
        onCopyResult={onCopyResult}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "keyManagement:oneTimeKey.copy" }),
    )
    await user.click(
      screen.getByTestId(TOKEN_PROVISIONING_TEST_IDS.oneTimeKeyCloseButton),
    )
    expect(onCopyResult).toHaveBeenCalledExactlyOnceWith("success")
    expect(onClose).toHaveBeenCalledTimes(1)

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi
          .fn()
          .mockRejectedValue(new Error("clipboard unavailable")),
      },
    })
    const secondClose = vi.fn()
    render(
      <OneTimeSecretDialog
        isOpen={true}
        result={{ ...RESULT, secret: "sk-second-secret" }}
        onClose={secondClose}
        autoCopy={false}
        onCopyResult={onCopyResult}
      />,
    )
    await user.click(
      screen.getAllByRole("button", {
        name: "keyManagement:oneTimeKey.copy",
      })[1]!,
    )
    await user.click(
      screen.getAllByTestId(
        TOKEN_PROVISIONING_TEST_IDS.oneTimeKeyCloseButton,
      )[1]!,
    )
    expect(onCopyResult).toHaveBeenLastCalledWith("failure")
    expect(onCopyResult.mock.calls).toEqual([["success"], ["failure"]])
    expect(JSON.stringify(onCopyResult.mock.calls)).not.toContain(RESULT.secret)
    expect(secondClose).not.toHaveBeenCalled()
  })

  it("keeps the plaintext visible after a failed save and prevents duplicate save submissions", async () => {
    const user = userEvent.setup()
    let resolveSave: (() => void) | undefined
    const onSave = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSave = resolve
        }),
    )
    const onSaveResult = vi.fn()
    const onClose = vi.fn()
    render(
      <OneTimeSecretDialog
        isOpen={true}
        result={RESULT}
        onClose={onClose}
        autoCopy={false}
        saveAction={{ onSave }}
        onSaveResult={onSaveResult}
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
    expect(onSaveResult).toHaveBeenCalledExactlyOnceWith("success")
    await user.click(
      screen.getByTestId(TOKEN_PROVISIONING_TEST_IDS.oneTimeKeyCloseButton),
    )
    expect(onClose).toHaveBeenCalledTimes(1)

    const failedSave = vi.fn().mockRejectedValue(new Error("storage failed"))
    render(
      <OneTimeSecretDialog
        isOpen={true}
        result={{ ...RESULT, secret: "sk-third-secret" }}
        onClose={vi.fn()}
        autoCopy={false}
        saveAction={{ onSave: failedSave }}
        onSaveResult={onSaveResult}
      />,
    )
    await user.click(
      screen.getAllByTestId(
        TOKEN_PROVISIONING_TEST_IDS.oneTimeKeySaveButton,
      )[1]!,
    )
    expect(failedSave).toHaveBeenCalledTimes(1)
    expect(screen.getByDisplayValue("sk-third-secret")).toBeInTheDocument()
    expect(onSaveResult).toHaveBeenLastCalledWith("failure")
    expect(onSaveResult.mock.calls).toEqual([["success"], ["failure"]])
    expect(JSON.stringify(onSaveResult.mock.calls)).not.toContain(RESULT.secret)
  })

  it("treats successful auto-copy as handled and resets that state for a new result", async () => {
    const onClose = vi.fn()
    const { rerender } = render(
      <OneTimeSecretDialog isOpen={true} result={RESULT} onClose={onClose} />,
    )
    await act(async () => undefined)
    await userEvent
      .setup()
      .click(
        screen.getByTestId(TOKEN_PROVISIONING_TEST_IDS.oneTimeKeyCloseButton),
      )
    expect(onClose).toHaveBeenCalledTimes(1)

    rerender(
      <OneTimeSecretDialog
        isOpen={true}
        result={{ ...RESULT, secret: "sk-new-secret" }}
        onClose={onClose}
        autoCopy={false}
      />,
    )
    await userEvent
      .setup()
      .click(
        screen.getByTestId(TOKEN_PROVISIONING_TEST_IDS.oneTimeKeyCloseButton),
      )
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(
      screen.getByText("keyManagement:oneTimeKey.closeConfirm.title"),
    ).toBeInTheDocument()
  })

  it("does not treat failed auto-copy or a backdrop click as acknowledgement", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi
          .fn()
          .mockRejectedValue(new Error("clipboard unavailable")),
      },
    })
    const onClose = vi.fn()
    render(
      <OneTimeSecretDialog isOpen={true} result={RESULT} onClose={onClose} />,
    )
    await act(async () => undefined)

    fireEvent.click(document.querySelector('[data-slot="modal-overlay"]')!)
    expect(onClose).not.toHaveBeenCalled()

    await userEvent
      .setup()
      .click(
        screen.getByTestId(TOKEN_PROVISIONING_TEST_IDS.oneTimeKeyCloseButton),
      )
    expect(
      screen.getByText("keyManagement:oneTimeKey.closeConfirm.title"),
    ).toBeInTheDocument()
  })

  it("ignores a stale copy completion while the replacement secret remains guarded", async () => {
    const user = userEvent.setup()
    const firstCopy = createDeferred<void>()
    const secondCopy = createDeferred<void>()
    const writeText = vi
      .fn()
      .mockReturnValueOnce(firstCopy.promise)
      .mockReturnValueOnce(secondCopy.promise)
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    })
    const onCopyResult = vi.fn()
    const onClose = vi.fn()
    const { rerender } = render(
      <OneTimeSecretDialog
        isOpen={true}
        result={RESULT}
        onClose={onClose}
        autoCopy={false}
        onCopyResult={onCopyResult}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "keyManagement:oneTimeKey.copy" }),
    )
    rerender(
      <OneTimeSecretDialog
        isOpen={true}
        result={{ ...RESULT, secret: "sk-replacement-secret" }}
        onClose={onClose}
        autoCopy={false}
        onCopyResult={onCopyResult}
      />,
    )
    await user.click(
      screen.getByRole("button", { name: "keyManagement:oneTimeKey.copy" }),
    )
    expect(writeText).toHaveBeenCalledTimes(2)

    await act(async () => {
      firstCopy.resolve()
    })
    expect(onCopyResult).not.toHaveBeenCalled()
    await user.click(
      screen.getByRole("button", { name: "keyManagement:oneTimeKey.copy" }),
    )
    expect(writeText).toHaveBeenCalledTimes(2)
    await user.click(
      screen.getByTestId(TOKEN_PROVISIONING_TEST_IDS.oneTimeKeyCloseButton),
    )
    expect(onClose).not.toHaveBeenCalled()
    expect(
      screen.getByText("keyManagement:oneTimeKey.closeConfirm.title"),
    ).toBeInTheDocument()

    await act(async () => {
      secondCopy.resolve()
    })
    expect(onCopyResult).toHaveBeenCalledExactlyOnceWith("success")
  })

  it("ignores a stale save completion while the replacement save remains guarded", async () => {
    const user = userEvent.setup()
    const firstSave = createDeferred<void>()
    const secondSave = createDeferred<void>()
    const firstSaveAction = vi.fn(() => firstSave.promise)
    const secondSaveAction = vi.fn(() => secondSave.promise)
    const onSaveResult = vi.fn()
    const onClose = vi.fn()
    const { rerender } = render(
      <OneTimeSecretDialog
        isOpen={true}
        result={RESULT}
        onClose={onClose}
        autoCopy={false}
        saveAction={{ onSave: firstSaveAction }}
        onSaveResult={onSaveResult}
      />,
    )

    await user.click(
      screen.getByTestId(TOKEN_PROVISIONING_TEST_IDS.oneTimeKeySaveButton),
    )
    rerender(
      <OneTimeSecretDialog
        isOpen={true}
        result={{ ...RESULT, secret: "sk-replacement-secret" }}
        onClose={onClose}
        autoCopy={false}
        saveAction={{ onSave: secondSaveAction }}
        onSaveResult={onSaveResult}
      />,
    )
    await user.click(
      screen.getByTestId(TOKEN_PROVISIONING_TEST_IDS.oneTimeKeySaveButton),
    )
    expect(secondSaveAction).toHaveBeenCalledOnce()

    await act(async () => {
      firstSave.resolve()
    })
    expect(onSaveResult).not.toHaveBeenCalled()
    await user.click(
      screen.getByTestId(TOKEN_PROVISIONING_TEST_IDS.oneTimeKeySaveButton),
    )
    expect(secondSaveAction).toHaveBeenCalledOnce()
    await user.click(
      screen.getByTestId(TOKEN_PROVISIONING_TEST_IDS.oneTimeKeyCloseButton),
    )
    expect(onClose).not.toHaveBeenCalled()
    expect(
      screen.getByText("keyManagement:oneTimeKey.closeConfirm.title"),
    ).toBeInTheDocument()

    await act(async () => {
      secondSave.resolve()
    })
    expect(onSaveResult).toHaveBeenCalledExactlyOnceWith("success")
  })

  it("allows one successful save per result and resets for a replacement", async () => {
    const user = userEvent.setup()
    const firstSave = vi.fn().mockResolvedValue(undefined)
    const secondSave = vi.fn().mockResolvedValue(undefined)
    const { rerender } = render(
      <OneTimeSecretDialog
        isOpen={true}
        result={RESULT}
        onClose={vi.fn()}
        autoCopy={false}
        saveAction={{ onSave: firstSave }}
      />,
    )

    const firstSaveButton = screen.getByTestId(
      TOKEN_PROVISIONING_TEST_IDS.oneTimeKeySaveButton,
    )
    await user.click(firstSaveButton)
    expect(firstSaveButton).toBeDisabled()
    await user.click(firstSaveButton)
    expect(firstSave).toHaveBeenCalledOnce()

    rerender(
      <OneTimeSecretDialog
        isOpen={true}
        result={{ ...RESULT, secret: "sk-replacement-secret" }}
        onClose={vi.fn()}
        autoCopy={false}
        saveAction={{ onSave: secondSave }}
      />,
    )
    await user.click(
      screen.getByTestId(TOKEN_PROVISIONING_TEST_IDS.oneTimeKeySaveButton),
    )
    expect(secondSave).toHaveBeenCalledOnce()
  })

  it("contains a throwing copy observer without changing copy success", async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onCopyResult = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error("observer failed")
      })
      .mockImplementation(() => undefined)
    render(
      <OneTimeSecretDialog
        isOpen={true}
        result={RESULT}
        onClose={onClose}
        autoCopy={false}
        onCopyResult={onCopyResult}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "keyManagement:oneTimeKey.copy" }),
    )
    await waitFor(() =>
      expect(onCopyResult).toHaveBeenCalledExactlyOnceWith("success"),
    )
    await user.click(
      screen.getByTestId(TOKEN_PROVISIONING_TEST_IDS.oneTimeKeyCloseButton),
    )
    expect(onClose).toHaveBeenCalledOnce()
  })

  it("contains a throwing save observer without changing save success", async () => {
    const user = userEvent.setup()
    const onSave = vi.fn().mockResolvedValue(undefined)
    const onSaveResult = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error("observer failed")
      })
      .mockImplementation(() => undefined)
    render(
      <OneTimeSecretDialog
        isOpen={true}
        result={RESULT}
        onClose={vi.fn()}
        autoCopy={false}
        saveAction={{ onSave }}
        onSaveResult={onSaveResult}
      />,
    )

    const saveButton = screen.getByTestId(
      TOKEN_PROVISIONING_TEST_IDS.oneTimeKeySaveButton,
    )
    await user.click(saveButton)
    await waitFor(() =>
      expect(onSaveResult).toHaveBeenCalledExactlyOnceWith("success"),
    )
    expect(saveButton).toBeDisabled()
    expect(onSave).toHaveBeenCalledOnce()
  })

  it("auto-copies once per result and open cycle despite observer rerenders", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    })
    const onClose = vi.fn()
    const { rerender } = render(
      <OneTimeSecretDialog
        isOpen={true}
        result={RESULT}
        onClose={onClose}
        onCopyResult={vi.fn()}
      />,
    )
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce())

    rerender(
      <OneTimeSecretDialog
        isOpen={true}
        result={RESULT}
        onClose={onClose}
        onCopyResult={vi.fn()}
      />,
    )
    await act(async () => undefined)
    expect(writeText).toHaveBeenCalledOnce()

    rerender(
      <OneTimeSecretDialog
        isOpen={false}
        result={RESULT}
        onClose={onClose}
        onCopyResult={vi.fn()}
      />,
    )
    rerender(
      <OneTimeSecretDialog
        isOpen={true}
        result={RESULT}
        onClose={onClose}
        onCopyResult={vi.fn()}
      />,
    )
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2))

    rerender(
      <OneTimeSecretDialog
        isOpen={true}
        result={{ ...RESULT, secret: "sk-new-secret" }}
        onClose={onClose}
        onCopyResult={vi.fn()}
      />,
    )
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(3))
  })

  it("gives concurrent secret inputs unique label targets", () => {
    render(
      <>
        <OneTimeSecretDialog
          isOpen={true}
          result={RESULT}
          onClose={vi.fn()}
          autoCopy={false}
        />
        <OneTimeSecretDialog
          isOpen={true}
          result={{ ...RESULT, secret: "sk-second-secret" }}
          onClose={vi.fn()}
          autoCopy={false}
        />
      </>,
    )

    const inputs = screen.getAllByLabelText("keyManagement:oneTimeKey.keyLabel")
    expect(inputs).toHaveLength(2)
    expect(inputs[0]).toHaveAttribute("id")
    expect(inputs[1]).toHaveAttribute("id")
    expect(inputs[0]!.id).not.toBe(inputs[1]!.id)
  })

  it("moves focus into the loss confirmation and restores it after cancel", async () => {
    const user = userEvent.setup()
    render(
      <OneTimeSecretDialog
        isOpen={true}
        result={RESULT}
        onClose={vi.fn()}
        autoCopy={false}
      />,
    )
    const closeButton = screen.getByTestId(
      TOKEN_PROVISIONING_TEST_IDS.oneTimeKeyCloseButton,
    )

    await user.click(closeButton)
    const confirmation = await screen.findByRole("dialog", {
      name: "keyManagement:oneTimeKey.closeConfirm.title",
    })
    await waitFor(() =>
      expect(confirmation).toContainElement(
        document.activeElement as HTMLElement,
      ),
    )

    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:oneTimeKey.closeConfirm.cancel",
      }),
    )
    await waitFor(() => expect(closeButton).toHaveFocus())
  })

  it("uses the one-time secret title as the dialog accessible name", () => {
    render(
      <OneTimeSecretDialog
        isOpen={true}
        result={RESULT}
        onClose={vi.fn()}
        autoCopy={false}
      />,
    )

    expect(
      screen.getByRole("dialog", { name: "keyManagement:oneTimeKey.title" }),
    ).toBeInTheDocument()
  })

  it("returns focus to the original launcher after a terminal editor hands off to the secret", async () => {
    const user = userEvent.setup()
    const FocusWorkflowHarness = () => {
      const [phase, setPhase] = useState<"idle" | "editor" | "secret">("idle")
      return (
        <>
          <button type="button" onClick={() => setPhase("editor")}>
            Open native editor
          </button>
          <Modal
            isOpen={phase === "editor"}
            onClose={() => setPhase("idle")}
            title="Native editor"
            focusWorkflowId="native-create-example"
          >
            <button type="button" onClick={() => setPhase("secret")}>
              Save native key
            </button>
          </Modal>
          <OneTimeSecretDialog
            isOpen={phase === "secret"}
            result={RESULT}
            onClose={() => setPhase("idle")}
            autoCopy={false}
            focusWorkflowId="native-create-example"
          />
        </>
      )
    }
    render(<FocusWorkflowHarness />)

    const trigger = screen.getByRole("button", {
      name: "Open native editor",
    })
    await user.click(trigger)
    await user.click(screen.getByRole("button", { name: "Save native key" }))
    const secretDialog = await screen.findByRole("dialog", {
      name: "keyManagement:oneTimeKey.title",
    })
    expect(secretDialog).toContainElement(document.activeElement as HTMLElement)
    await user.click(
      screen.getByRole("button", { name: "keyManagement:oneTimeKey.copy" }),
    )
    await user.click(
      screen.getByTestId(TOKEN_PROVISIONING_TEST_IDS.oneTimeKeyCloseButton),
    )
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await waitFor(() => expect(trigger).toHaveFocus())
  })
})
