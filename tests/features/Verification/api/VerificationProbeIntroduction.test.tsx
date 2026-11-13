import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { I18nextProvider } from "react-i18next"
import { describe, expect, it, vi } from "vitest"

import { VerificationProbeIntroduction } from "~/features/Verification/api/VerificationProbeIntroduction"
import zhCN from "~/locales/zh-CN/aiApiVerification.json"
import { API_VERIFICATION_PROBE_IDS } from "~/services/verification/aiApiVerification"
import { createResourceTestI18n, testI18n } from "~~/tests/test-utils/i18n"

describe("VerificationProbeIntroduction", () => {
  it("renders visual icon badge, title, and handles missing translations gracefully", () => {
    render(
      <I18nextProvider i18n={testI18n}>
        <VerificationProbeIntroduction
          probeId={API_VERIFICATION_PROBE_IDS.Models}
          title="模型列表"
          onRun={vi.fn()}
        />
      </I18nextProvider>,
    )

    expect(screen.getByTestId("probe-intro-icon")).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "模型列表" }),
    ).toBeInTheDocument()
    expect(
      screen.getByText("aiApiVerification:verifyDialog.intro.probes.models"),
    ).toBeInTheDocument()
    expect(
      screen.getByText("aiApiVerification:verifyDialog.intro.startHint"),
    ).toBeInTheDocument()
  })

  it("renders visual icon badge, title, description, and interactive run button with resources", async () => {
    const user = userEvent.setup()
    const handleRun = vi.fn()
    const i18n = await createResourceTestI18n(
      { "zh-CN": { aiApiVerification: zhCN } },
      "zh-CN",
    )

    render(
      <I18nextProvider i18n={i18n}>
        <VerificationProbeIntroduction
          probeId={API_VERIFICATION_PROBE_IDS.Models}
          title="模型列表"
          onRun={handleRun}
        />
      </I18nextProvider>,
    )

    expect(screen.getByTestId("probe-intro-icon")).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "模型列表" }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(zhCN.verifyDialog.intro.probes.models),
    ).toBeInTheDocument()

    const runButton = screen.getByRole("button", { name: "运行" })
    expect(runButton).toBeEnabled()
    expect(runButton).toHaveAttribute("data-testid", "probe-intro-run-button")
    await user.click(runButton)
    expect(handleRun).toHaveBeenCalledOnce()
  })

  it("disables the run action when disabled is true", async () => {
    const handleRun = vi.fn()
    const i18n = await createResourceTestI18n(
      { "zh-CN": { aiApiVerification: zhCN } },
      "zh-CN",
    )

    render(
      <I18nextProvider i18n={i18n}>
        <VerificationProbeIntroduction
          probeId={API_VERIFICATION_PROBE_IDS.Models}
          title="模型列表"
          onRun={handleRun}
          disabled
        />
      </I18nextProvider>,
    )

    const runButton = screen.getByRole("button", { name: "运行" })
    expect(runButton).toBeDisabled()
  })
})
