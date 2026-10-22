import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { AccountFormLayout } from "~/features/AccountManagement/components/AccountDialog/form/AccountFormLayout"
import { ACCOUNT_EDIT_SECTIONS } from "~/features/AccountManagement/components/AccountDialog/form/accountFormSections"
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "~~/tests/test-utils/render"

vi.mock("~/hooks/useMediaQuery", () => ({
  useMediaQuery: () => false,
}))

async function renderScrollableForm() {
  render(
    <div data-slot="modal-body">
      <AccountFormLayout continuous>
        {ACCOUNT_EDIT_SECTIONS.map(({ id, title }) => (
          <section key={id} id={id} data-account-form-section>
            <h3 tabIndex={-1}>{title}</h3>
          </section>
        ))}
      </AccountFormLayout>
    </div>,
  )
  const navigation = await screen.findByRole("navigation")
  const scroller = navigation.closest<HTMLElement>('[data-slot="modal-body"]')!
  Object.defineProperties(scroller, {
    clientHeight: { value: 300 },
    scrollHeight: { value: 1000 },
  })
  const scrollTo = vi.fn()
  scroller.scrollTo = scrollTo
  return { scroller, scrollTo }
}

describe("AccountFormLayout navigation", () => {
  afterEach(() => vi.restoreAllMocks())

  it.each([false, true])(
    "scrolls to a section and focuses its heading (reduced motion: %s)",
    async (reducedMotion) => {
      vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
        matches: query === "(prefers-reduced-motion: reduce)" && reducedMotion,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }))
      const user = userEvent.setup()
      const { scroller, scrollTo } = await renderScrollableForm()
      const heading = screen.getByRole("heading", {
        name: "sections.accountAuth.title",
      })
      vi.spyOn(heading.parentElement!, "getBoundingClientRect").mockReturnValue(
        { top: 250 } as DOMRect,
      )
      await user.click(
        screen.getByRole("button", {
          name: "accountDialog:sections.accountAuth.title",
        }),
      )
      expect(scrollTo).toHaveBeenCalledWith({
        top: 238,
        behavior: reducedMotion ? "instant" : "smooth",
      })
      expect(heading).toHaveFocus()

      // A resize must preserve the explicit destination until manual input.
      fireEvent.resize(window)
      const navigation = screen.getByRole("navigation")
      expect(
        within(navigation).getByRole("button", {
          name: "accountDialog:sections.accountAuth.title",
        }),
      ).toHaveAttribute("aria-current", "location")
      scroller.scrollTop = 700
      fireEvent.wheel(scroller)
      fireEvent.scroll(scroller)
      expect(
        within(navigation).getByRole("button", {
          name: "accountDialog:sections.tagsAndNotes.title",
        }),
      ).toHaveAttribute("aria-current", "location")
    },
  )

  it("reveals the active directory button when it is clipped on either side", async () => {
    await renderScrollableForm()
    const navigation = screen.getByRole("navigation")
    const active = within(navigation).getByRole("button", {
      name: "accountDialog:sections.tagsAndNotes.title",
    })
    await waitFor(() =>
      expect(active).toHaveAttribute("aria-current", "location"),
    )
    navigation.scrollLeft = 100
    vi.spyOn(navigation, "getBoundingClientRect").mockReturnValue({
      left: 100,
      right: 300,
    } as DOMRect)
    const bounds = vi.spyOn(active, "getBoundingClientRect")
    bounds.mockReturnValue({ left: 80, right: 180 } as DOMRect)
    fireEvent.resize(window)
    expect(navigation.scrollLeft).toBe(80)
    bounds.mockReturnValue({ left: 250, right: 350 } as DOMRect)
    fireEvent.resize(window)
    expect(navigation.scrollLeft).toBe(130)
  })
})
