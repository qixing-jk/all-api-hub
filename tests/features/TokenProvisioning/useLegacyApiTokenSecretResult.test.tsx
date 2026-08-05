import { render, renderHook, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { act } from "react"
import { describe, expect, it, vi } from "vitest"

import { OneTimeSecretDialog } from "~/features/TokenProvisioning/components/OneTimeSecretDialog"
import { useLegacyApiTokenSecretResult } from "~/features/TokenProvisioning/hooks/useLegacyApiTokenSecretResult"
import { TOKEN_PROVISIONING_TEST_IDS } from "~/features/TokenProvisioning/testIds"

type LegacyToken = { name: string; key: string } | null

const LegacySecretHarness = ({
  token,
  saveAction,
}: {
  token: LegacyToken
  saveAction?: { onSave: () => Promise<void> }
}) => {
  const result = useLegacyApiTokenSecretResult(token)

  return (
    <OneTimeSecretDialog
      isOpen={true}
      result={result}
      onClose={vi.fn()}
      saveAction={saveAction}
    />
  )
}

const createDeferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>((nextResolve) => {
    resolve = nextResolve
  })
  return { promise, resolve }
}

describe("useLegacyApiTokenSecretResult", () => {
  it("projects exactly the presentation fields and changes identity at value boundaries", () => {
    const initialToken = { name: "Example key", key: "sk-example-secret" }
    const { result, rerender } = renderHook(
      ({ token }: { token: LegacyToken }) =>
        useLegacyApiTokenSecretResult(token),
      { initialProps: { token: initialToken } as { token: LegacyToken } },
    )
    const initialResult = result.current

    expect(initialResult).toEqual({
      displayName: "Example key",
      secret: "sk-example-secret",
    })

    rerender({ token: { ...initialToken } })
    expect(result.current).toBe(initialResult)

    rerender({ token: { ...initialToken, name: "Renamed key" } })
    const renamedResult = result.current
    expect(renamedResult).not.toBe(initialResult)

    rerender({ token: { name: "Renamed key", key: "sk-replacement" } })
    expect(result.current).not.toBe(renamedResult)

    rerender({ token: null })
    expect(result.current).toBeNull()

    rerender({ token: { name: "Renamed key", key: "sk-replacement" } })
    expect(result.current).toEqual({
      displayName: "Renamed key",
      secret: "sk-replacement",
    })
    expect(result.current).not.toBe(renamedResult)
  })

  it("keeps one result generation for fresh tokens with unchanged presentation values", async () => {
    const pendingCopy = createDeferred()
    const writeText = vi.fn(() => pendingCopy.promise)
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    })
    const token = { name: "Example key", key: "sk-example-secret" }
    const { rerender } = render(<LegacySecretHarness token={token} />)

    expect(writeText).toHaveBeenCalledExactlyOnceWith("sk-example-secret")

    rerender(<LegacySecretHarness token={{ ...token }} />)
    expect(writeText).toHaveBeenCalledOnce()

    rerender(
      <LegacySecretHarness
        token={{ name: "Replacement key", key: "sk-replacement-secret" }}
      />,
    )
    await waitFor(() =>
      expect(writeText).toHaveBeenNthCalledWith(2, "sk-replacement-secret"),
    )

    await act(async () => {
      pendingCopy.resolve()
    })
  })

  it("preserves the pending save guard when a parent recreates the token", async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    })
    const pendingSave = createDeferred()
    const onSave = vi.fn(() => pendingSave.promise)
    const token = { name: "Example key", key: "sk-example-secret" }
    const { rerender } = render(
      <LegacySecretHarness token={token} saveAction={{ onSave }} />,
    )

    await user.click(
      screen.getByTestId(TOKEN_PROVISIONING_TEST_IDS.oneTimeKeySaveButton),
    )
    rerender(
      <LegacySecretHarness token={{ ...token }} saveAction={{ onSave }} />,
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
