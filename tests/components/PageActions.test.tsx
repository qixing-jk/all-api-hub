import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { PageActions } from "~/components/PageActions"
import { render, screen } from "~~/tests/test-utils/render"

describe("PageActions", () => {
  beforeEach(() => {
    vi.mocked(window.matchMedia).mockImplementation((query) => ({
      matches: query === "(max-width: 767px)",
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  })

  it("keeps all actions directly accessible on mobile", async () => {
    const user = userEvent.setup()
    const onRefresh = vi.fn()
    render(
      <PageActions primary={<button>Add account</button>}>
        <button onClick={onRefresh}>Refresh</button>
        <button disabled>Import</button>
      </PageActions>,
    )
    await user.tab()
    expect(
      await screen.findByRole("button", { name: "Add account" }),
    ).toBeVisible()
    expect(
      screen.queryByRole("button", { name: "common:actions.more" }),
    ).not.toBeInTheDocument()
    const refresh = screen.getByRole("button", { name: "Refresh" })
    expect(refresh).toBeVisible()
    expect(screen.getByRole("button", { name: "Import" })).toBeDisabled()
    await user.click(refresh)
    expect(onRefresh).toHaveBeenCalledTimes(1)
    expect(refresh).toBeVisible()
    expect(refresh).toHaveFocus()
  })
})
