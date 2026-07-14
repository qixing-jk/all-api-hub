import { render as renderBare } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"

import { KeyDisplay } from "~/features/KeyManagement/components/TokenListItem/KeyDisplay"
import { buildTokenIdentityKey } from "~/features/KeyManagement/utils"
import { render, screen } from "~~/tests/test-utils/render"

const TOKEN_A_KEY = "sk-a-12345678901234567890"
const TOKEN_B_KEY = "sk-b-12345678901234567890"

/**
 * Test harness rendering multiple KeyDisplay instances to verify identity-key isolation.
 */
function TestKeyDisplayList({
  isTokenALoading = false,
  onTokenAToggle,
}: {
  isTokenALoading?: boolean
  onTokenAToggle?: () => void
} = {}) {
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set())
  const tokenAIdentityKey = buildTokenIdentityKey("acc-a", 1)
  const tokenBIdentityKey = buildTokenIdentityKey("acc-b", 1)

  const toggleKeyVisibility = (identityKey: string) => {
    setVisibleKeys((prev) => {
      const next = new Set(prev)
      if (next.has(identityKey)) {
        next.delete(identityKey)
      } else {
        next.add(identityKey)
      }
      return next
    })
  }

  return (
    <div>
      <div>
        <KeyDisplay
          tokenKey={TOKEN_A_KEY}
          tokenIdentityKey={tokenAIdentityKey}
          visibleKeys={visibleKeys}
          isKeyVisibilityLoading={isTokenALoading}
          toggleKeyVisibility={() => {
            onTokenAToggle?.()
            toggleKeyVisibility(tokenAIdentityKey)
          }}
        />
      </div>
      <div>
        <KeyDisplay
          tokenKey={TOKEN_B_KEY}
          tokenIdentityKey={tokenBIdentityKey}
          visibleKeys={visibleKeys}
          toggleKeyVisibility={() => toggleKeyVisibility(tokenBIdentityKey)}
        />
      </div>
    </div>
  )
}

describe("KeyDisplay identity keys", () => {
  it("keeps token visibility collision-safe across accounts", async () => {
    const user = userEvent.setup()

    render(<TestKeyDisplayList />)

    const showButtons = await screen.findAllByRole("button", {
      name: "keyManagement:actions.showKey",
    })
    expect(screen.queryByText(TOKEN_A_KEY)).not.toBeInTheDocument()
    expect(screen.queryByText(TOKEN_B_KEY)).not.toBeInTheDocument()
    await user.click(showButtons[0]!)

    expect(screen.getByText(TOKEN_A_KEY)).toBeInTheDocument()
    expect(screen.queryByText(TOKEN_B_KEY)).not.toBeInTheDocument()
  })

  it("keeps the current visibility action identity stable while loading", async () => {
    const user = userEvent.setup()
    const toggleKeyVisibility = vi.fn()
    const { rerender } = renderBare(
      <TestKeyDisplayList onTokenAToggle={toggleKeyVisibility} />,
    )

    const [showButton] = screen.getAllByRole("button", {
      name: "keyManagement:actions.showKey",
    })
    expect(showButton).toBeEnabled()

    rerender(
      <TestKeyDisplayList
        isTokenALoading
        onTokenAToggle={toggleKeyVisibility}
      />,
    )

    const [busyShowButton] = screen.getAllByRole("button", {
      name: "keyManagement:actions.showKey",
    })
    expect(busyShowButton).toHaveAttribute("aria-busy", "true")
    expect(busyShowButton).toBeDisabled()
    await user.click(busyShowButton)
    expect(toggleKeyVisibility).not.toHaveBeenCalled()

    rerender(<TestKeyDisplayList onTokenAToggle={toggleKeyVisibility} />)

    const [restoredShowButton] = screen.getAllByRole("button", {
      name: "keyManagement:actions.showKey",
    })
    expect(restoredShowButton).toBeEnabled()
    expect(restoredShowButton).not.toHaveAttribute("aria-busy")
  })
})
