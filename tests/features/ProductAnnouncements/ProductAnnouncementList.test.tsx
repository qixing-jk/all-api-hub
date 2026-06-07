import userEvent from "@testing-library/user-event"
import type { ComponentProps } from "react"
import { describe, expect, it, vi } from "vitest"

import { ProductAnnouncementList } from "~/features/ProductAnnouncements/ProductAnnouncementList"
import type { ProductAnnouncement } from "~/services/productAnnouncements/types"
import { render, screen } from "~~/tests/test-utils/render"

const notice = {
  id: "risk",
  revision: 1,
  severity: "warning",
  priority: 10,
  startsAt: 1,
  expiresAt: 2,
  title: "Risk notice",
  message: "Please review.",
  seen: false,
  dismissed: false,
} satisfies ProductAnnouncement

function renderList(
  props: Partial<ComponentProps<typeof ProductAnnouncementList>> = {},
) {
  return render(
    <ProductAnnouncementList
      notices={props.notices ?? []}
      emptyMessage={props.emptyMessage ?? "Nothing to review"}
      isLoading={props.isLoading}
      testId={props.testId ?? "product-announcement-list"}
      onDismiss={props.onDismiss ?? vi.fn()}
      onRestore={props.onRestore ?? vi.fn()}
      onOpenCta={props.onOpenCta}
    />,
    {
      withReleaseUpdateStatusProvider: false,
      withThemeProvider: false,
      withUserPreferencesProvider: false,
    },
  )
}

describe("ProductAnnouncementList", () => {
  it("renders loading and empty states", () => {
    const { rerender } = renderList({ isLoading: true })

    expect(screen.getByText("productAnnouncements:loading")).toBeVisible()

    rerender(
      <ProductAnnouncementList
        notices={[]}
        emptyMessage="Nothing to review"
        testId="product-announcement-list"
        onDismiss={vi.fn()}
        onRestore={vi.fn()}
      />,
    )

    expect(screen.getByText("Nothing to review")).toBeVisible()
  })

  it("falls back to generic action labels when scoped translations are missing", async () => {
    const user = userEvent.setup()
    const onDismiss = vi.fn()
    const onRestore = vi.fn()

    renderList({
      notices: [notice, { ...notice, id: "dismissed", dismissed: true }],
      onDismiss,
      onRestore,
    })

    await user.click(
      screen.getByRole("button", {
        name: "productAnnouncements:actions.dismiss Risk notice",
      }),
    )
    await user.click(
      screen.getByRole("button", {
        name: "productAnnouncements:actions.restore Risk notice",
      }),
    )

    expect(onDismiss).toHaveBeenCalledWith("risk", 1)
    expect(onRestore).toHaveBeenCalledWith("dismissed")
  })

  it("does not render malformed CTA URLs", () => {
    renderList({
      notices: [
        {
          ...notice,
          cta: {
            label: "Broken link",
            url: "not a url",
          },
        },
      ],
    })

    expect(screen.queryByRole("link", { name: "Broken link" })).toBeNull()
  })
})
