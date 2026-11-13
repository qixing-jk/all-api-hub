import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { I18nextProvider } from "react-i18next"
import { describe, expect, it } from "vitest"

import { VERIFICATION_SOURCE_KINDS } from "~/features/Verification/api/types"
import {
  VerificationDialogHeader,
  VerificationSourceSubtitle,
} from "~/features/Verification/api/VerificationDialogHeader"
import zhVerification from "~/locales/zh-CN/aiApiVerification.json"
import type { ApiVerificationHistorySummary } from "~/services/verification/verificationResultHistory"
import { createResourceTestI18n, testI18n } from "~~/tests/test-utils/i18n"

const historySummary = (
  overrides: Partial<ApiVerificationHistorySummary> = {},
): ApiVerificationHistorySummary => ({
  target: { kind: "profile-model", profileId: "p", modelId: "m" },
  targetKey: "profile:p:model:m",
  status: "pass",
  verifiedAt: Date.parse("2026-01-02T03:04:05.000Z"),
  apiType: "openai-compatible",
  probes: [],
  ...overrides,
})

const renderHeader = (props: Parameters<typeof VerificationDialogHeader>[0]) =>
  render(
    <I18nextProvider i18n={testI18n}>
      <VerificationDialogHeader {...props} />
    </I18nextProvider>,
  )

describe("VerificationDialogHeader", () => {
  it("omits an untested history badge when there is no saved run", () => {
    renderHeader({ title: "Verification", historySummary: null })
    expect(
      screen.queryByText("aiApiVerification:verifyDialog.history.lastVerified"),
    ).not.toBeInTheDocument()
  })
  it.each([
    [VERIFICATION_SOURCE_KINDS.Account, "账号：12"],
    [VERIFICATION_SOURCE_KINDS.Profile, "凭据：12"],
  ] as const)(
    "labels a numeric %s name in the source subtitle",
    async (sourceKind, label) => {
      const i18n = await createResourceTestI18n(
        { "zh-CN": { aiApiVerification: zhVerification } },
        "zh-CN",
      )
      render(
        <I18nextProvider i18n={i18n}>
          <VerificationSourceSubtitle
            baseUrl="https://example.com"
            name="12"
            sourceKind={sourceKind}
          />
        </I18nextProvider>,
      )
      expect(screen.getByText(label)).toBeVisible()
      expect(
        screen.getByRole("link", { name: "https://example.com" }),
      ).toHaveAttribute("href", "https://example.com")
    },
  )

  it("keeps the explanation behind an accessible help button", async () => {
    const user = userEvent.setup()
    renderHeader({ title: "Verification" })
    expect(screen.queryByRole("note")).not.toBeInTheDocument()
    const help = screen.getByRole("button", {
      name: "aiApiVerification:verifyDialog.about",
    })
    expect(help).toHaveAccessibleDescription(
      "aiApiVerification:verifyDialog.warning",
    )
    await user.tab()
    expect(help).toHaveFocus()
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "aiApiVerification:verifyDialog.warning",
    )
    await user.keyboard("{Escape}")
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument()
    expect(help).toHaveFocus()
    await user.click(help)
    expect(await screen.findByRole("tooltip")).toBeVisible()
  })

  it("shows the persisted summary and its timestamp beside the title", () => {
    renderHeader({
      title: "Verification",
      subtitle: <span>source</span>,
      historySummary: historySummary(),
    })

    expect(screen.getByText("Verification")).toBeVisible()
    expect(screen.getByText("source")).toBeVisible()
    const time = document.querySelector("time")
    expect(time).not.toBeNull()
    // The relative label is what the user reads; the title carries the exact time.
    expect(time).toHaveAttribute("dateTime", "2026-01-02T03:04:05.000Z")
    expect(time).toHaveAttribute("title")
  })

  it("keeps a subtitle separator only when it renders before the timestamp", () => {
    const withSubtitle = renderHeader({
      title: "Verification",
      subtitle: <span>source</span>,
      historySummary: historySummary(),
    })
    expect(withSubtitle.container.textContent).toContain("·")
    withSubtitle.unmount()

    // Without a subtitle there is nothing for the separator to separate.
    renderHeader({
      title: "Verification",
      historySummary: historySummary(),
    })
    expect(document.body.textContent).not.toContain("·")
  })

  it("renders the caller's summary node when no history is available", () => {
    renderHeader({
      title: "Verification",
      summary: <span data-testid="live-summary">2/3 passed</span>,
    })

    expect(screen.getByTestId("live-summary")).toHaveTextContent("2/3 passed")
  })

  it("switches to the children layout when no title is given", () => {
    const { container } = renderHeader({
      children: <span data-testid="custom-title">Custom</span>,
      summary: <span data-testid="custom-summary">3/3 passed</span>,
    })

    expect(screen.getByTestId("custom-title")).toBeVisible()
    expect(screen.getByTestId("custom-summary")).toBeVisible()
    expect(container.querySelector("h5")).toBeNull()
  })

  it("omits the summary slot entirely when the children layout has none", () => {
    renderHeader({ children: <span>Only children</span> })

    expect(screen.getByText("Only children")).toBeVisible()
    expect(
      screen.queryByText("aiApiVerification:verifyDialog.history.summary"),
    ).toBeNull()
  })

  it("does not resolve a timestamp from a summary without a verification time", () => {
    renderHeader({
      title: "Verification",
      historySummary: historySummary({ verifiedAt: undefined as never }),
    })

    expect(document.querySelector("time")).toBeNull()
  })
})
