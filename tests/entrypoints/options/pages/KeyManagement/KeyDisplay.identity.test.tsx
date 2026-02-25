import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it } from "vitest"

import { KeyDisplay } from "~/entrypoints/options/pages/KeyManagement/components/TokenListItem/KeyDisplay"
import { buildTokenIdentityKey } from "~/entrypoints/options/pages/KeyManagement/utils"
import { render, screen } from "~/tests/test-utils/render"

const TOKEN_A_KEY = "sk-a-12345678901234567890"
const TOKEN_B_KEY = "sk-b-12345678901234567890"

/**
 * Test harness rendering multiple KeyDisplay instances to verify identity-key isolation.
 */
function TestKeyDisplayList() {
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set())

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
          tokenIdentityKey={buildTokenIdentityKey("acc-a", 1)}
          visibleKeys={visibleKeys}
          toggleKeyVisibility={toggleKeyVisibility}
        />
      </div>
      <div>
        <KeyDisplay
          tokenKey={TOKEN_B_KEY}
          tokenIdentityKey={buildTokenIdentityKey("acc-b", 1)}
          visibleKeys={visibleKeys}
          toggleKeyVisibility={toggleKeyVisibility}
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
})
