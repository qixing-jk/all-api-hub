import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { I18nextProvider } from "react-i18next"
import { expect, it, vi } from "vitest"

import { buildProbeState } from "~/features/Verification/api/probeState"
import { VerificationTestSection } from "~/features/Verification/api/VerificationLayout"
import { VerificationProbeRow } from "~/features/Verification/api/VerificationProbeRow"
import en from "~/locales/en/aiApiVerification.json"
import {
  createProfileVerificationHistoryTarget,
  createVerificationHistorySummary,
} from "~/services/verification/verificationResultHistory"
import { createResourceTestI18n } from "~~/tests/test-utils/i18n"

it("keeps a current result without detailed output distinct from history", async () => {
  const i18n = await createResourceTestI18n({ en: { aiApiVerification: en } })
  render(
    <I18nextProvider i18n={i18n}>
      <VerificationProbeRow
        probeId="models"
        result={{
          id: "models",
          status: "fail",
          latencyMs: 0,
          summary: "No response",
        }}
        runButtonProps={{ onClick: vi.fn() }}
      />
    </I18nextProvider>,
  )
  expect(screen.getByText("Fail")).toBeVisible()
  expect(screen.queryByText(/^Previously:/)).not.toBeInTheDocument()
})

it.each(["pass", "fail", "unsupported"] as const)(
  "keeps the description and a rerun hint for a restored %s probe without raw evidence",
  async (status) => {
    const user = userEvent.setup()
    const i18n = await createResourceTestI18n({ en: { aiApiVerification: en } })
    const run = vi.fn()
    render(
      <I18nextProvider i18n={i18n}>
        <VerificationTestSection
          tools={null}
          configuration={<input aria-label="Connection" />}
        >
          <VerificationProbeRow
            probeId="models"
            historical
            result={{
              id: "models",
              status,
              latencyMs: 100,
              summary: "Saved result",
              metrics: [
                {
                  responseTimeMs: 1000,
                  timeToFirstOutputMs: 100,
                  outputTokens: 10,
                },
              ],
            }}
            runButtonProps={{ onClick: run }}
          />
        </VerificationTestSection>
      </I18nextProvider>,
    )
    await user.click(screen.getByRole("button", { name: "Model list" }))
    const intro = document.querySelector(
      "[data-verification-introduction]",
    ) as HTMLElement
    expect(intro).not.toBeNull()
    expect(
      within(intro).getByText(en.verifyDialog.intro.probes.models),
    ).toBeVisible()
    expect(
      within(intro).getByText(en.verifyDialog.history.storage.probe),
    ).toBeVisible()
    expect(
      screen.queryByRole("region", { name: "Execution result" }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Statistics" })).toBeVisible()
    await user.click(screen.getByRole("button", { name: "Statistics" }))
    expect(screen.getByText("First output")).toBeVisible()
    expect(
      within(screen.getByRole("dialog", { name: "Statistics" })).getByText(
        "100ms",
      ),
    ).toBeVisible()
    await user.keyboard("{Escape}")
    await user.click(within(intro).getByTestId("probe-intro-run-button"))
    expect(run).toHaveBeenCalledOnce()
  },
)

it.each(["pass", "fail", "unsupported"] as const)(
  "marks restored %s results explicitly and opens help without selecting a test",
  async (status) => {
    const user = userEvent.setup()
    const i18n = await createResourceTestI18n({ en: { aiApiVerification: en } })
    const saved = createVerificationHistorySummary({
      target: createProfileVerificationHistoryTarget("profile")!,
      apiType: "openai-compatible",
      results: [
        { id: "models", status, latencyMs: 100, summary: "Saved result" },
      ],
    })
    const probe = buildProbeState("openai-compatible", saved)[0]!
    const run = vi.fn()
    render(
      <I18nextProvider i18n={i18n}>
        <VerificationTestSection tools={null}>
          <VerificationProbeRow
            probeId="text-generation"
            result={null}
            runButtonProps={{ onClick: run }}
          />
          <VerificationProbeRow
            probeId="models"
            result={probe.result}
            historical={probe.historical}
            runButtonProps={{ onClick: run }}
          />
        </VerificationTestSection>
      </I18nextProvider>,
    )
    const select = screen.getByRole("button", { name: "Model list" })
    const badge = screen.getByRole("button", { name: /^Previously:/ })
    expect(select).not.toContainElement(badge)
    expect(badge).toHaveTextContent(
      status === "pass" ? "Pass" : status === "fail" ? "Fail" : "Unsupported",
    )
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument()
    await user.click(badge)
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "History keeps the test summary",
    )
    expect(select).toHaveAttribute("aria-expanded", "false")
    expect(run).not.toHaveBeenCalled()
    await user.keyboard("{Escape}")
    expect(select).toHaveAttribute("aria-expanded", "false")
  },
)
