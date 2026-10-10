import { within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ComponentProps } from "react"
import { describe, expect, it, vi } from "vitest"

import { ProductAnnouncementList } from "~/features/ProductAnnouncements/ProductAnnouncementList"
import { ProductAnnouncementPanel } from "~/features/ProductAnnouncements/ProductAnnouncementPopover"
import { PRODUCT_ANNOUNCEMENT_TEST_IDS } from "~/features/ProductAnnouncements/testIds"
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
  it("keeps refresh feedback outside existing notices and clears it when ready", async () => {
    const props = {
      surface: "popover" as const,
      state: {
        view: {
          notices: [notice],
          activeNotices: [notice],
          dismissedNotices: [],
          primaryRiskNotice: null,
          activeRiskCount: 0,
          unseenActiveCount: 0,
        },
      },
      onDismiss: vi.fn(),
      onRestore: vi.fn().mockResolvedValue(true),
      onClose: vi.fn(),
    }
    const { rerender } = render(
      <ProductAnnouncementPanel {...props} isLoading />,
      {
        withReleaseUpdateStatusProvider: false,
        withThemeProvider: false,
        withUserPreferencesProvider: false,
      },
    )
    const list = screen.getByTestId(PRODUCT_ANNOUNCEMENT_TEST_IDS.activeList)
    expect(within(list).getByText("Risk notice")).toBeVisible()
    expect(list).toHaveAttribute("aria-busy", "true")
    expect(
      screen.getByRole("status", { name: "productAnnouncements:loading" }),
    ).toBeVisible()
    expect(within(list).queryByRole("status")).not.toBeInTheDocument()
    await userEvent.setup().click(
      screen.getByRole("button", {
        name: "productAnnouncements:actions.close",
      }),
    )
    expect(props.onClose).toHaveBeenCalledOnce()

    rerender(<ProductAnnouncementPanel {...props} isLoading={false} />)
    expect(screen.queryByRole("status")).not.toBeInTheDocument()
    expect(list).toHaveAttribute("aria-busy", "false")
    expect(within(list).getByText("Risk notice")).toBeVisible()
  })

  it("renders loading and empty states", () => {
    const { rerender } = renderList({ isLoading: true })

    expect(
      screen.getByRole("status", { name: "productAnnouncements:loading" }),
    ).toBeVisible()
    expect(
      screen.queryByText("productAnnouncements:loading"),
    ).not.toBeInTheDocument()

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

  it("keeps existing announcements visible while refreshing", () => {
    renderList({ notices: [notice], isLoading: true })

    expect(screen.getByText("Risk notice")).toBeVisible()
    expect(screen.queryByRole("status")).not.toBeInTheDocument()
    expect(screen.getByTestId("product-announcement-list")).toHaveAttribute(
      "aria-busy",
      "true",
    )
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
            kind: "external",
            label: "Broken link",
            url: "not a url",
          },
        },
      ],
    })

    expect(screen.queryByRole("link", { name: "Broken link" })).toBeNull()
  })

  it("does not render CTAs with unknown kinds", () => {
    renderList({
      notices: [
        {
          ...notice,
          cta: {
            kind: "command",
            label: "Run command",
            url: "options.html",
          } as never,
        },
      ],
    })

    expect(screen.queryByRole("link", { name: "Run command" })).toBeNull()
  })

  it("renders extension CTAs with the current runtime origin", () => {
    renderList({
      notices: [
        {
          ...notice,
          cta: {
            kind: "extension",
            label: "Open settings",
            url: "options.html?tab=refresh&anchor=shield-method#basic",
          },
        },
      ],
    })

    expect(screen.getByRole("link", { name: "Open settings" })).toHaveAttribute(
      "href",
      "chrome-extension://test-extension-id/options.html?tab=refresh&anchor=shield-method#basic",
    )
  })
})
