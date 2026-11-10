import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { I18nextProvider } from "react-i18next"
import { describe, expect, it, vi } from "vitest"

import { VerificationTestSection } from "~/features/Verification/api/VerificationLayout"
import { VerificationProbeDetails } from "~/features/Verification/api/VerificationProbeDetails"
import { VerificationProbeRow } from "~/features/Verification/api/VerificationProbeRow"
import zhCN from "~/locales/zh-CN/aiApiVerification.json"
import {
  API_VERIFICATION_PROBE_IDS,
  API_VERIFICATION_PROBE_STATUSES,
} from "~/services/verification/aiApiVerification"
import { createResourceTestI18n, testI18n } from "~~/tests/test-utils/i18n"

describe("Verification test workspace", () => {
  it.each(["Pass", "Fail", "Stopped"])(
    "announces the %s status on the selection button",
    (status) => {
      render(
        <VerificationTestSection tools={null}>
          <VerificationProbeDetails
            label="Text"
            heading={<span>Text</span>}
            status={<span>{status}</span>}
          />
          <VerificationProbeDetails
            label="Context"
            heading={<span>Context</span>}
            headingAccessory={<button>Help</button>}
            status={<span>{status}</span>}
          />
        </VerificationTestSection>,
      )
      expect(
        screen.getByRole("button", { name: "Text" }),
      ).toHaveAccessibleDescription(status)
      expect(
        screen.getByRole("button", { name: "Context" }),
      ).toHaveAccessibleDescription(status)
    },
  )

  it("names a selectable detail from its heading when no explicit label is supplied", () => {
    render(
      <VerificationTestSection tools={null}>
        <VerificationProbeDetails
          heading={<span>Drawing</span>}
          headingAccessory={<button type="button">Help</button>}
        >
          <p>Drawing details</p>
        </VerificationProbeDetails>
      </VerificationTestSection>,
    )
    expect(screen.getByRole("button", { name: "Drawing" })).toHaveAttribute(
      "aria-expanded",
      "true",
    )
    expect(screen.getByRole("button", { name: "Help" })).toBeVisible()
    expect(screen.getByText("Drawing details")).toBeVisible()
  })

  it.each(["disabled", "loading"] as const)(
    "runs from the inline hint and respects the row's %s state",
    async (blockedState) => {
      const user = userEvent.setup()
      const run = vi.fn()
      const i18n = await createResourceTestI18n(
        { "zh-CN": { aiApiVerification: zhCN } },
        "zh-CN",
      )
      const workspace = (blocked = true, isRunning = false) => (
        <I18nextProvider i18n={i18n}>
          <VerificationProbeRow
            probeId={API_VERIFICATION_PROBE_IDS.Models}
            result={null}
            isRunning={isRunning}
            runButtonProps={{
              onClick: run,
              children: "Run models",
              [blockedState]: blocked,
            }}
          />
        </I18nextProvider>
      )
      const { rerender } = render(workspace())
      const inlineRun = screen.getByRole("button", {
        name: "运行",
      })
      expect(inlineRun.closest("p")).toHaveTextContent(
        "点击 运行 开始本项测试。",
      )
      expect(inlineRun).toBeDisabled()
      await user.click(inlineRun)
      expect(run).not.toHaveBeenCalled()
      rerender(workspace(false))
      expect(inlineRun).toBeEnabled()
      inlineRun.focus()
      await user.keyboard("{Enter}")
      expect(run).toHaveBeenCalledOnce()
      rerender(workspace(false, true))
      expect(
        screen.queryByRole("button", { name: "运行" }),
      ).not.toBeInTheDocument()
    },
  )

  it.each(Object.values(API_VERIFICATION_PROBE_IDS))(
    "explains %s with its purpose instead of a generic step diagram",
    async (probeId) => {
      const i18n = await createResourceTestI18n(
        { "zh-CN": { aiApiVerification: zhCN } },
        "zh-CN",
      )
      render(
        <I18nextProvider i18n={i18n}>
          <VerificationProbeRow
            probeId={probeId}
            result={null}
            runButtonProps={{ children: "运行" }}
          />
        </I18nextProvider>,
      )
      expect(screen.queryByRole("list")).not.toBeInTheDocument()
      expect(
        screen.getByText(zhCN.verifyDialog.intro.probes[probeId]),
      ).toBeVisible()
    },
  )

  it("explains an idle model-list test and replaces the introduction with its result", async () => {
    const user = userEvent.setup()
    const run = vi.fn()
    const workspace = (finished = false) => (
      <I18nextProvider i18n={testI18n}>
        <VerificationTestSection tools={null}>
          <VerificationProbeRow
            probeId={API_VERIFICATION_PROBE_IDS.Models}
            result={
              finished
                ? {
                    id: API_VERIFICATION_PROBE_IDS.Models,
                    status: API_VERIFICATION_PROBE_STATUSES.Pass,
                    summary: "Fetched models",
                    latencyMs: 10,
                    output: { modelCount: 2 },
                  }
                : null
            }
            runButtonProps={{ onClick: run, children: "Run models" }}
          />
        </VerificationTestSection>
      </I18nextProvider>
    )
    const { rerender } = render(workspace())
    expect(
      screen.getByText("aiApiVerification:verifyDialog.intro.probes.models"),
    ).toBeVisible()
    expect(
      screen.getByText("aiApiVerification:verifyDialog.intro.startHint"),
    ).toBeVisible()
    await user.click(screen.getByRole("button", { name: "Run models" }))
    expect(run).toHaveBeenCalledOnce()
    rerender(workspace(true))
    expect(
      screen.queryByText("aiApiVerification:verifyDialog.intro.startHint"),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole("region", {
        name: "aiApiVerification:verifyDialog.details.result",
      }),
    ).toBeVisible()
  })

  it("shows a running routine test instead of its previous result", () => {
    render(
      <I18nextProvider i18n={testI18n}>
        <VerificationProbeRow
          probeId={API_VERIFICATION_PROBE_IDS.TextGeneration}
          isRunning
          summary="Previous summary"
          result={{
            id: API_VERIFICATION_PROBE_IDS.TextGeneration,
            status: API_VERIFICATION_PROBE_STATUSES.Pass,
            summary: "Previous result",
            output: "Previous output",
            latencyMs: 10,
          }}
          runButtonProps={{ children: "Stop" }}
        />
      </I18nextProvider>,
    )
    expect(
      screen.getByText("aiApiVerification:verifyDialog.actions.running"),
    ).toBeVisible()
    expect(
      screen.queryByText("aiApiVerification:verifyDialog.status.pass"),
    ).not.toBeInTheDocument()
    expect(screen.queryByText("Previous summary")).not.toBeInTheDocument()
    expect(screen.queryByText("Previous output")).not.toBeInTheDocument()
  })
  const runDrawing = vi.fn()
  const workspace = (result?: string, includeModels = true) => (
    <I18nextProvider i18n={testI18n}>
      <VerificationTestSection
        tools={
          <VerificationProbeDetails
            label="Drawing"
            heading={<span>Drawing</span>}
            action={<button onClick={runDrawing}>Run drawing</button>}
            detailsContent={result ? <p>{result}</p> : undefined}
          >
            <input aria-label="Drawing draft" defaultValue="A bird" />
          </VerificationProbeDetails>
        }
      >
        {includeModels && (
          <VerificationProbeDetails
            label="Models"
            heading={<span>Models</span>}
          >
            <p>Models configuration</p>
          </VerificationProbeDetails>
        )}
        <VerificationProbeDetails label="Text" heading={<span>Text</span>}>
          <input aria-label="Text draft" defaultValue="Reply OK" />
        </VerificationProbeDetails>
      </VerificationTestSection>
    </I18nextProvider>
  )

  it("selects one detail, retains drafts, and never selects a background result", async () => {
    const user = userEvent.setup()
    const { rerender } = render(workspace())
    expect(screen.getByRole("button", { name: "Models" })).toHaveAttribute(
      "aria-expanded",
      "true",
    )
    expect(screen.getByText("Models configuration")).toBeVisible()
    expect(screen.getByLabelText("Text draft")).not.toBeVisible()
    await user.click(screen.getByRole("button", { name: "Text" }))
    const input = screen.getByRole("textbox", { name: "Text draft" })
    await user.clear(input)
    await user.type(input, "Keep this draft")
    await user.click(screen.getByRole("button", { name: "Run drawing" }))
    expect(runDrawing).toHaveBeenCalledOnce()
    rerender(workspace("Drawing finished"))
    expect(input).toBeVisible()
    expect(screen.getByText("Drawing finished")).not.toBeVisible()
    await user.click(screen.getByRole("button", { name: "Drawing" }))
    expect(screen.getByText("Drawing finished")).toBeVisible()
    expect(input).not.toBeVisible()
    const selection = screen.getByRole("button", { name: "Text" })
    selection.focus()
    await user.keyboard("{Enter}")
    expect(screen.getByRole("textbox", { name: "Text draft" })).toBe(input)
    expect(input).toHaveValue("Keep this draft")
    expect(screen.getByText("Drawing finished")).not.toBeVisible()
  })

  it("selects an available item if the current suite removes the selection", async () => {
    const { rerender } = render(workspace())
    rerender(workspace(undefined, false))
    const routine = screen.getByRole("region", {
      name: "aiApiVerification:verifyDialog.sections.routine",
    })
    expect(
      within(routine).getByRole("button", { name: "Text" }),
    ).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByRole("textbox", { name: "Text draft" })).toBeVisible()
  })
})
