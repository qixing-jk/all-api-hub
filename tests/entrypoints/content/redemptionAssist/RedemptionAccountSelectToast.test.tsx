import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { I18nextProvider } from "react-i18next"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { RedemptionAccountSelectToast } from "~/features/RedemptionAssist/components/RedemptionAccountSelectToast"
import redemptionAssistEn from "~/locales/en/redemptionAssist.json"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import {
  REDEMPTION_ACCOUNT_SUPPORT_STATUSES,
  type RedemptionAccountCandidate,
} from "~/services/redemption/contracts"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"
import { buildDisplaySiteData } from "~~/tests/test-utils/factories"
import { createResourceTestI18n } from "~~/tests/test-utils/i18n"

const { trackStartedMock } = vi.hoisted(() => ({
  trackStartedMock: vi.fn(),
}))

vi.mock("~/services/productAnalytics/actions", () => ({
  trackProductAnalyticsActionStarted: trackStartedMock,
}))

function makeCandidate(
  overrides: Partial<RedemptionAccountCandidate>,
): RedemptionAccountCandidate {
  return {
    ...buildDisplaySiteData(),
    automaticRedemptionSupport: {
      status: REDEMPTION_ACCOUNT_SUPPORT_STATUSES.Supported,
    },
    ...overrides,
  }
}

describe("RedemptionAccountSelectToast", () => {
  it("offers support requests for unsupported accounts without disclosing private account context or confirming redemption", async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    const i18n = await createResourceTestI18n({
      en: { redemptionAssist: redemptionAssistEn },
    })
    render(
      <I18nextProvider i18n={i18n}>
        <RedemptionAccountSelectToast
          accounts={[
            {
              ...buildDisplaySiteData({ id: "auto", name: "Automatic" }),
              automaticRedemptionSupport: {
                status: REDEMPTION_ACCOUNT_SUPPORT_STATUSES.Supported,
              },
            },
            {
              ...buildDisplaySiteData({
                id: "private-id",
                name: "Private account label",
                siteType: "sub2api",
                baseUrl:
                  "https://secret-user:secret-pass@manual.test/private-path?token=secret-token#secret-fragment",
              }),
              manualRedemptionUrl: "https://manual.test/redeem",
              automaticRedemptionSupport: {
                status: REDEMPTION_ACCOUNT_SUPPORT_STATUSES.Unsupported,
              },
            },
            {
              ...buildDisplaySiteData({
                id: "no-route",
                siteType: "RightCode",
                baseUrl: "https://unmapped.test",
              }),
              automaticRedemptionSupport: {
                status: REDEMPTION_ACCOUNT_SUPPORT_STATUSES.Unsupported,
              },
            },
          ]}
          onSelect={onSelect}
        />
      </I18nextProvider>,
    )
    const links = screen.getAllByRole("link", {
      name: "Request support",
    })
    expect(links).toHaveLength(2)
    const destination = new URL(links[0]!.getAttribute("href")!)
    expect(`${destination.origin}${destination.pathname}`).toBe(
      "https://github.com/qixing-jk/all-api-hub/issues/new",
    )
    expect(destination.searchParams.get("template")).toBe(
      "site_support_request.yml",
    )
    expect(destination.searchParams.get("site-url")).toBe("https://manual.test")
    expect(destination.searchParams.get("failure-type")).toBe(
      "redemption_unsupported",
    )
    expect(destination.searchParams.get("failure-message")).toContain("sub2api")
    expect(decodeURIComponent(destination.href)).not.toMatch(
      /secret|private-path|private-id|Private account label/,
    )
    expect(
      new URL(links[1]!.getAttribute("href")!).searchParams.get("site-url"),
    ).toBe("https://unmapped.test")
    expect(links[0]).toHaveAttribute("target", "_blank")
    expect(links[0]).toHaveAttribute("rel", "noopener noreferrer")
    await user.click(links[0]!)
    await user.keyboard("{Enter}")
    expect(onSelect).not.toHaveBeenCalled()
  })
  it("keeps unsupported accounts last and prevents mouse or keyboard selection while offering the exact manual page", async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    const supported = makeCandidate({
      id: "auto",
      name: "Automatic",
      baseUrl: "https://auto.test",
      automaticRedemptionSupport: {
        status: REDEMPTION_ACCOUNT_SUPPORT_STATUSES.Supported,
      },
    })
    render(
      <RedemptionAccountSelectToast
        accounts={[
          makeCandidate({
            id: "manual",
            name: "Manual only",
            baseUrl: "https://manual.test",
            manualRedemptionUrl: "https://manual.test/redeem",
            automaticRedemptionSupport: {
              status: REDEMPTION_ACCOUNT_SUPPORT_STATUSES.Unsupported,
            },
          }),
          supported,
          makeCandidate({
            id: "unmapped",
            name: "No known page",
            baseUrl: "https://unmapped.test",
            checkIn: buildCheckInConfig({
              customCheckIn: { url: "https://check-in.test" },
            }),
            automaticRedemptionSupport: {
              status: REDEMPTION_ACCOUNT_SUPPORT_STATUSES.Unsupported,
            },
          }),
        ]}
        onSelect={onSelect}
      />,
    )
    expect(screen.getAllByRole("radio")[0]).toHaveAccessibleName(/Automatic/)
    const manual = screen.getByRole("radio", { name: /Manual only/ })
    expect(manual).toBeDisabled()
    expect(
      screen.getByRole("link", {
        name: "redemptionAssist:accountSelect.openSiteManual",
      }),
    ).toHaveAttribute("href", "https://manual.test/redeem")
    await user.click(manual)
    await user.click(screen.getByRole("textbox"))
    await user.keyboard("{ArrowDown}{Enter}")
    expect(onSelect).toHaveBeenLastCalledWith(supported)
    onSelect.mockClear()
    await user.type(screen.getByRole("textbox"), "Manual only")
    expect(
      screen.getByRole("button", {
        name: "redemptionAssist:accountSelect.confirm",
      }),
    ).toBeDisabled()
    await user.keyboard("{Enter}")
    expect(onSelect).not.toHaveBeenCalled()
  })
  it("identifies the receiving site even when an account uses a different check-in site", () => {
    render(
      <RedemptionAccountSelectToast
        accounts={[
          makeCandidate({
            id: "plan",
            name: "Plan",
            baseUrl: "https://receiving.test",
            checkIn: buildCheckInConfig({
              customCheckIn: { url: "https://giveaway.test" },
            }),
            automaticRedemptionSupport: {
              status: REDEMPTION_ACCOUNT_SUPPORT_STATUSES.Supported,
            },
          }),
        ]}
        onSelect={vi.fn()}
      />,
    )
    expect(screen.getByText("https://receiving.test")).toBeInTheDocument()
  })
  beforeEach(() => {
    vi.clearAllMocks()
    trackStartedMock.mockResolvedValue(undefined)
  })

  it("tracks fixed analytics metadata for account selection actions", async () => {
    const user = userEvent.setup()

    render(
      <RedemptionAccountSelectToast
        accounts={[
          makeCandidate({
            id: "account-a",
            name: "Private Account",
            baseUrl: "https://private.example",
            automaticRedemptionSupport: {
              status: REDEMPTION_ACCOUNT_SUPPORT_STATUSES.Supported,
            },
          }),
        ]}
        onSelect={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.cancel" }),
    )
    await user.click(
      screen.getByRole("button", {
        name: "redemptionAssist:accountSelect.confirm",
      }),
    )

    expect(trackStartedMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.RedemptionAssist,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.CancelRedemptionAccountSelection,
      surfaceId:
        PRODUCT_ANALYTICS_SURFACE_IDS.ContentRedemptionAccountSelectToast,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Content,
    })
    expect(trackStartedMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.RedemptionAssist,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.ConfirmRedemptionAccountSelection,
      surfaceId:
        PRODUCT_ANALYTICS_SURFACE_IDS.ContentRedemptionAccountSelectToast,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Content,
    })
  })
})
