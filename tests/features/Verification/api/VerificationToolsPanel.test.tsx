import { fireEvent, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { I18nextProvider } from "react-i18next"
import { describe, expect, it, vi } from "vitest"

import {
  VERIFICATION_TOOL_STATUSES,
  type VerificationToolsController,
} from "~/features/Verification/api/useVerificationTools"
import { VerificationProbeDetails } from "~/features/Verification/api/VerificationProbeDetails"
import { VerificationToolsPanel } from "~/features/Verification/api/VerificationToolsPanel"
import { getDefaultProbePrompt } from "~/services/verification/aiApiVerification/probes/probePrompts"
import { API_VERIFICATION_PROBE_IDS } from "~/services/verification/aiApiVerification/types"
import {
  AGENT_TEST_OUTCOMES,
  DRAWING_VERIFICATION_OUTCOMES,
  PELICAN_EXECUTION_MODES,
} from "~/services/verification/modelQuality/constants"
import {
  PELICAN_TEST_PROMPT,
  type PelicanTestResult,
} from "~/services/verification/modelQuality/pelican"
import { testI18n } from "~~/tests/test-utils/i18n"

const buildPelican = (
  overrides: Partial<PelicanTestResult> = {},
): PelicanTestResult => ({
  runAt: 0,
  latencyMs: 100,
  text: "<svg/>",
  svg: "<svg/>",
  analysis: {
    hasSvg: true,
    safe: true,
    viewBox: "0 0 100 50",
    byteSize: 6,
    counts: {
      path: 1,
      circle: 1,
      ellipse: 0,
      rect: 0,
      polygon: 0,
      polyline: 0,
      line: 0,
      text: 0,
      group: 0,
    },
    shapeCount: 2,
    wheelClues: 1,
  },
  ...overrides,
})

const buildController = (
  overrides: Partial<VerificationToolsController> = {},
): VerificationToolsController => ({
  isRunning: false,
  canRunPelican: true,
  isPelicanRunning: false,
  pelicanStatus: VERIFICATION_TOOL_STATUSES.Idle,
  pelican: null,
  pelicanErrorMessage: null,
  pelicanExecutionMode: PELICAN_EXECUTION_MODES.Reply,
  setPelicanExecutionMode: vi.fn(),
  runPelican: vi.fn(),
  stopPelican: vi.fn(),
  promptIds: [
    API_VERIFICATION_PROBE_IDS.TextGeneration,
    API_VERIFICATION_PROBE_IDS.StructuredOutput,
  ],
  promptDraft: {},
  isPromptsDirty: false,
  isSavingPrompts: false,
  promptSaveError: null,
  promptOverrides: {},
  setPromptDraftValue: vi.fn(),
  resetPrompt: vi.fn(),
  resetAllPrompts: vi.fn(),
  savePrompts: vi.fn(),
  getDefaultPrompt: (probeId) =>
    probeId === "pelican"
      ? PELICAN_TEST_PROMPT
      : getDefaultProbePrompt(probeId),
  ...overrides,
})

const renderPanel = (controller: VerificationToolsController) =>
  render(
    <I18nextProvider i18n={testI18n}>
      <VerificationToolsPanel controller={controller} />
    </I18nextProvider>,
  )

describe("VerificationToolsPanel", () => {
  it("shows the drawing outcome and elapsed time even before history is available", () => {
    renderPanel(buildController({ pelican: buildPelican() }))
    const latency = screen.getByText("100ms")
    expect(latency.closest('[data-slot="badge"]')).toHaveTextContent(
      "aiApiVerification:verifyDialog.tools.pelican.outcomes.generated",
    )
  })
  it("offers an explicit agent opt-in and locks it while running", async () => {
    const user = userEvent.setup()
    const setPelicanExecutionMode = vi.fn()
    const { rerender } = renderPanel(
      buildController({ setPelicanExecutionMode }),
    )
    const toggle = screen.getByRole("switch", {
      name: "aiApiVerification:verifyDialog.tools.agent.label",
    })
    expect(toggle).not.toBeChecked()
    await user.click(toggle)
    expect(setPelicanExecutionMode).toHaveBeenCalledWith(
      PELICAN_EXECUTION_MODES.Agent,
    )
    rerender(
      <I18nextProvider i18n={testI18n}>
        <VerificationToolsPanel
          controller={buildController({
            isPelicanRunning: true,
            pelicanExecutionMode: PELICAN_EXECUTION_MODES.Agent,
          })}
        />
      </I18nextProvider>,
    )
    expect(toggle).toBeDisabled()
  })

  it("shows restored drawing metadata without an empty execution-result panel", () => {
    renderPanel(
      buildController({
        pelicanSummary: {
          target: {
            kind: "profile-model",
            profileId: "profile",
            modelId: "model",
          },
          targetKey: "profile",
          apiType: "openai-compatible",
          modelId: "model",
          verifiedAt: 1000,
          latencyMs: 500,
          outcome: DRAWING_VERIFICATION_OUTCOMES.Generated,
          executionMode: PELICAN_EXECUTION_MODES.Agent,
          steps: 3,
          calls: 2,
          files: 1,
        },
      }),
    )
    expect(screen.getByTestId("pelican-history-summary")).toHaveTextContent(
      "aiApiVerification:verifyDialog.tools.pelican.historyOnly",
    )
    const summary = screen.getByTestId("pelican-history-summary")
    const latency = within(summary).getByText("500ms")
    expect(latency.closest('[data-slot="badge"]')).toHaveTextContent(
      "aiApiVerification:verifyDialog.tools.pelican.outcomes.generated",
    )
    expect(summary.querySelector("time")).toHaveAttribute("title")
    expect(screen.queryByTestId("pelican-svg-preview")).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", {
        name: "aiApiVerification:verifyDialog.details.result",
      }),
    ).not.toBeInTheDocument()
  })

  it("shows the actual agent outcome, files and tool feedback", async () => {
    const user = userEvent.setup()
    renderPanel(
      buildController({
        pelican: buildPelican({
          agent: {
            steps: 8,
            outcome: AGENT_TEST_OUTCOMES.NoArtifact,
            files: [{ path: "pelican.svg", content: "<svg/>" }],
            calls: [
              {
                toolName: "execute_js",
                input: { code: "return 2" },
                output: { result: 2 },
              },
            ],
          },
        }),
      }),
    )
    expect(
      screen.getByText("aiApiVerification:verifyDialog.tools.agent.noArtifact"),
    ).toBeVisible()
    await user.click(
      screen.getByRole("button", {
        name: "aiApiVerification:verifyDialog.tools.agent.calls",
      }),
    )
    expect(screen.getByText("execute_js")).toBeVisible()
    expect(screen.getByText(/return 2/)).toBeVisible()
    await user.click(
      screen.getByRole("button", {
        name: "aiApiVerification:verifyDialog.tools.agent.files",
      }),
    )
    expect(screen.getByRole("button", { name: "pelican.svg" })).toBeVisible()
  })

  it("shows the drawing test immediately without starting a model call", () => {
    const runPelican = vi.fn()
    renderPanel(buildController({ runPelican }))
    expect(
      screen.getByRole("button", {
        name: "aiApiVerification:verifyDialog.tools.pelican.run",
      }),
    ).toHaveTextContent("aiApiVerification:verifyDialog.actions.runOne")
    expect(
      screen.getByRole("button", {
        name: "aiApiVerification:verifyDialog.tools.pelican.run",
      }),
    ).toBeVisible()
    expect(
      screen.getByRole("switch", {
        name: "aiApiVerification:verifyDialog.tools.agent.label",
      }),
    ).toBeVisible()
    expect(runPelican).not.toHaveBeenCalled()
  })

  it("runs and stops the drawing test through the controller", async () => {
    const user = userEvent.setup()
    const runPelican = vi.fn()
    const stopPelican = vi.fn()
    renderPanel(buildController({ runPelican, stopPelican }))

    await user.click(
      screen.getByRole("button", {
        name: "aiApiVerification:verifyDialog.tools.pelican.run",
      }),
    )
    expect(runPelican).toHaveBeenCalledTimes(1)

    expect(stopPelican).not.toHaveBeenCalled()
  })

  it("shows a stop action while the drawing test runs", async () => {
    const user = userEvent.setup()
    const stopPelican = vi.fn()
    renderPanel(
      buildController({
        isRunning: true,
        isPelicanRunning: true,
        pelicanStatus: VERIFICATION_TOOL_STATUSES.Running,
        stopPelican,
      }),
    )

    await user.click(
      screen.getByRole("button", {
        name: "aiApiVerification:verifyDialog.tools.stop",
      }),
    )
    expect(stopPelican).toHaveBeenCalledTimes(1)
  })

  it("reports a stopped drawing run without an error", async () => {
    const user = userEvent.setup()
    const setPelicanExecutionMode = vi.fn()
    renderPanel(
      buildController({
        pelicanStatus: VERIFICATION_TOOL_STATUSES.Stopped,
        setPelicanExecutionMode,
      }),
    )

    expect(
      screen.getByText("aiApiVerification:verifyDialog.tools.stopped"),
    ).toBeVisible()
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()

    // The run is over, so the agent opt-in is usable again.
    await user.click(
      screen.getByRole("switch", {
        name: "aiApiVerification:verifyDialog.tools.agent.label",
      }),
    )
    expect(setPelicanExecutionMode).toHaveBeenCalledWith(
      PELICAN_EXECUTION_MODES.Agent,
    )
  })

  it("offers a recent run summary for a restored agent drawing", () => {
    renderPanel(
      buildController({
        pelican: buildPelican({
          agent: {
            steps: 2,
            outcome: AGENT_TEST_OUTCOMES.Completed,
            files: [{ path: "pelican.svg", content: "<svg/>" }],
            calls: [],
          },
        }),
      }),
    )

    expect(screen.getByTestId("agent-test-result")).toHaveTextContent(
      "aiApiVerification:verifyDialog.tools.agent.completed",
    )
  })

  it("disables the drawing test when the model cannot run it", () => {
    renderPanel(buildController({ canRunPelican: false }))

    expect(
      screen.getByRole("button", {
        name: "aiApiVerification:verifyDialog.tools.pelican.run",
      }),
    ).toBeDisabled()
  })

  it("renders a safe drawing as a data-url image", () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="2"/></svg>'
    renderPanel(
      buildController({
        pelicanStatus: VERIFICATION_TOOL_STATUSES.Done,
        pelican: buildPelican({ svg, text: svg }),
      }),
    )

    expect(screen.getByTestId("pelican-svg-preview")).toHaveAttribute(
      "src",
      `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    )
  })

  it("explains an SVG image load failure instead of leaving a broken preview", () => {
    renderPanel(buildController({ pelican: buildPelican() }))
    fireEvent.error(screen.getByTestId("pelican-svg-preview"))
    expect(screen.getByRole("alert")).toHaveTextContent(
      "aiApiVerification:verifyDialog.tools.pelican.previewFailed",
    )
    expect(screen.queryByTestId("pelican-svg-preview")).not.toBeInTheDocument()
  })

  it("refuses to render unsafe markup", () => {
    const svg = '<svg onload="alert(1)"><circle cx="5" cy="5" r="2"/></svg>'
    renderPanel(
      buildController({
        pelicanStatus: VERIFICATION_TOOL_STATUSES.Done,
        pelican: buildPelican({
          svg,
          text: svg,
          analysis: { ...buildPelican().analysis, safe: false },
        }),
      }),
    )

    expect(screen.queryByTestId("pelican-svg-preview")).not.toBeInTheDocument()
    expect(
      screen.getByText("aiApiVerification:verifyDialog.tools.pelican.unsafe"),
    ).toBeInTheDocument()
  })

  it("explains when the answer had no SVG", () => {
    renderPanel(
      buildController({
        pelicanStatus: VERIFICATION_TOOL_STATUSES.Done,
        pelican: buildPelican({
          svg: null,
          text: "no drawing",
          analysis: {
            ...buildPelican().analysis,
            hasSvg: false,
            shapeCount: 0,
            wheelClues: 0,
          },
        }),
      }),
    )

    expect(
      screen.getByText("aiApiVerification:verifyDialog.tools.pelican.noSvg"),
    ).toBeInTheDocument()
  })

  it("surfaces a failed request with its sanitized message", () => {
    renderPanel(
      buildController({
        pelicanStatus: VERIFICATION_TOOL_STATUSES.Error,
        pelicanErrorMessage: "HTTP 401: unauthorized",
      }),
    )

    expect(
      screen.getByText(
        "aiApiVerification:verifyDialog.tools.errors.unexpected",
        { exact: false },
      ),
    ).toBeInTheDocument()
  })

  it("renders the drawing prompt editor and reports edits to the controller", async () => {
    const user = userEvent.setup()
    const setPromptDraftValue = vi.fn()
    renderPanel(
      buildController({
        promptDraft: { pelican: "Draw a custom bird" },
        setPromptDraftValue,
      }),
    )

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
    await user.click(
      screen.getByRole("button", {
        name: "aiApiVerification:verifyDialog.tools.prompts.editorLabel",
      }),
    )
    const textarea = screen.getByRole("textbox", {
      name: "aiApiVerification:verifyDialog.tools.prompts.editorLabel",
    })
    expect(textarea).toHaveValue("Draw a custom bird")

    await user.type(textarea, "!")
    expect(setPromptDraftValue).toHaveBeenCalledWith(
      "pelican",
      "Draw a custom bird!",
    )
  })

  it("resets the custom pelican prompt", async () => {
    const user = userEvent.setup()
    const resetPrompt = vi.fn()
    renderPanel(
      buildController({
        promptDraft: { pelican: "Custom" },
        resetPrompt,
      }),
    )

    await user.click(
      screen.getByRole("button", {
        name: "aiApiVerification:verifyDialog.tools.prompts.editorLabel",
      }),
    )
    const resetBtn = screen.getByRole("button", {
      name: "aiApiVerification:verifyDialog.tools.prompts.resetOne",
    })
    await user.click(resetBtn)
    expect(resetPrompt).toHaveBeenCalledWith("pelican")
  })

  it("keeps unrelated probe editors out of the drawing section", () => {
    renderPanel(buildController())
    expect(
      screen.queryByTestId("verification-prompt-text-generation"),
    ).not.toBeInTheDocument()
  })
})

const renderPrompt = (
  controller: VerificationToolsController,
  expanded = true,
) => {
  const result = render(
    <I18nextProvider i18n={testI18n}>
      <VerificationProbeDetails
        controller={controller}
        probeId={API_VERIFICATION_PROBE_IDS.TextGeneration}
      />
    </I18nextProvider>,
  )
  const disclosure = screen.queryByRole("button", {
    name: "aiApiVerification:verifyDialog.tools.prompts.editorLabel",
  })
  if (expanded && disclosure) fireEvent.click(disclosure)
  return result
}
describe("VerificationPromptEditor", () => {
  it("starts collapsed with a visible prompt label and expands on request", async () => {
    const user = userEvent.setup()
    renderPrompt(buildController(), false)
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
    const disclosure = screen.getByRole("button", {
      name: "aiApiVerification:verifyDialog.tools.prompts.editorLabel",
    })
    expect(disclosure).toHaveAttribute("aria-expanded", "false")
    await user.click(disclosure)
    expect(screen.getByRole("textbox")).toHaveValue("Reply with exactly: OK")
    expect(
      screen.getByText(
        "aiApiVerification:verifyDialog.tools.prompts.sharedHint",
      ),
    ).toBeVisible()
  })
  it("shows the saved prompt after expanding its editor", () => {
    renderPrompt(buildController())
    expect(screen.getByRole("textbox")).toHaveValue("Reply with exactly: OK")
    expect(
      screen.queryByRole("button", {
        name: "aiApiVerification:verifyDialog.tools.prompts.edit",
      }),
    ).not.toBeInTheDocument()
  })

  it("offers an icon reset without a custom badge", async () => {
    const user = userEvent.setup()
    const resetPrompt = vi.fn()
    renderPrompt(
      buildController({
        promptDraft: {
          [API_VERIFICATION_PROBE_IDS.TextGeneration]: "Say YES",
        },
        resetPrompt,
      }),
    )

    const row = screen.getByTestId(
      `verification-prompt-${API_VERIFICATION_PROBE_IDS.TextGeneration}`,
    )
    expect(row).not.toHaveTextContent(
      "aiApiVerification:verifyDialog.tools.prompts.customBadge",
    )
    expect(within(row).getByRole("textbox")).toHaveValue("Say YES")

    const reset = within(row).getByRole("button", {
      name: "aiApiVerification:verifyDialog.tools.prompts.resetOne",
    })
    expect(reset).toHaveTextContent("")
    expect(reset).toHaveAttribute(
      "title",
      "aiApiVerification:verifyDialog.tools.prompts.resetOne",
    )
    await user.click(reset)

    expect(resetPrompt).toHaveBeenCalledWith(
      API_VERIFICATION_PROBE_IDS.TextGeneration,
    )
  })

  it("reports edits to the controller as they are typed", async () => {
    const user = userEvent.setup()
    const setPromptDraftValue = vi.fn()
    renderPrompt(buildController({ setPromptDraftValue }))

    const row = screen.getByTestId(
      `verification-prompt-${API_VERIFICATION_PROBE_IDS.TextGeneration}`,
    )
    await user.type(within(row).getByRole("textbox"), "A")

    expect(setPromptDraftValue).toHaveBeenCalledWith(
      API_VERIFICATION_PROBE_IDS.TextGeneration,
      "Reply with exactly: OKA",
    )
  })

  it("renders the prompt editor textbox without a redundant manual save button", () => {
    renderPrompt(buildController())

    expect(
      screen.queryByRole("button", {
        name: "aiApiVerification:verifyDialog.tools.prompts.save",
      }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole("textbox")).toBeInTheDocument()
  })

  it("shows the reset button when custom and calls resetPrompt", async () => {
    const user = userEvent.setup()
    const resetPrompt = vi.fn()
    renderPrompt(
      buildController({
        promptDraft: { [API_VERIFICATION_PROBE_IDS.TextGeneration]: "Edited" },
        resetPrompt,
      }),
    )

    const reset = screen.getByRole("button", {
      name: "aiApiVerification:verifyDialog.tools.prompts.resetOne",
    })
    expect(reset).toBeEnabled()
    await user.click(reset)

    expect(resetPrompt).toHaveBeenCalledWith(
      API_VERIFICATION_PROBE_IDS.TextGeneration,
    )
  })

  it("keeps the reset action out while a save is in flight", () => {
    renderPrompt(
      buildController({
        promptDraft: { [API_VERIFICATION_PROBE_IDS.TextGeneration]: "Edited" },
        isSavingPrompts: true,
      }),
    )

    expect(
      screen.getByRole("button", {
        name: "aiApiVerification:verifyDialog.tools.prompts.resetOne",
      }),
    ).toBeDisabled()
  })

  it("re-fits the editor when the textarea is resized", () => {
    const observations: Array<() => void> = []
    const disconnect = vi.fn()
    class RecordingResizeObserver {
      constructor(callback: () => void) {
        observations.push(callback)
      }
      observe() {}
      unobserve() {}
      disconnect = disconnect
    }
    vi.stubGlobal("ResizeObserver", RecordingResizeObserver)

    const { unmount } = renderPrompt(buildController())
    const textarea = screen.getByRole("textbox", {
      name: "aiApiVerification:verifyDialog.tools.prompts.editorLabel",
    }) as HTMLTextAreaElement
    expect(observations).toHaveLength(1)

    // jsdom reports zero measurements, so give the element real ones to stand in
    // for a viewport change and for the content that has to fit inside it.
    let clientWidth = 120
    let scrollHeight = 40
    Object.defineProperty(textarea, "clientWidth", {
      configurable: true,
      get: () => clientWidth,
    })
    Object.defineProperty(textarea, "scrollHeight", {
      configurable: true,
      get: () => scrollHeight,
    })

    observations[0]!()
    expect(textarea.style.height).toBe("40px")

    // A resize that leaves the width alone must not re-measure the content.
    scrollHeight = 99
    observations[0]!()
    expect(textarea.style.height).toBe("40px")

    clientWidth = 200
    scrollHeight = 64
    observations[0]!()
    expect(textarea.style.height).toBe("64px")

    unmount()
    expect(disconnect).toHaveBeenCalled()

    vi.unstubAllGlobals()
  })

  it("shows a saving indicator when prompt is persisting", () => {
    renderPrompt(
      buildController({
        isSavingPrompts: true,
      }),
    )
    expect(screen.getByRole("status")).toBeInTheDocument()
  })

  it("does not offer an editor for a test without an editable prompt", () => {
    renderPrompt(buildController({ promptIds: [] }))
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
  })

  it("shows a save failure without losing the draft", async () => {
    renderPrompt(
      buildController({
        isPromptsDirty: true,
        promptDraft: {
          [API_VERIFICATION_PROBE_IDS.TextGeneration]: "Edited draft",
        },
        promptSaveError: "storage locked",
      }),
    )

    expect(
      screen.getByText(
        "aiApiVerification:verifyDialog.tools.prompts.saveFailed",
        {
          exact: false,
        },
      ),
    ).toBeInTheDocument()
  })
})

describe("restored verification details", () => {
  it("keeps result disclosure keyboard-accessible and restores it after collapsing", async () => {
    const user = userEvent.setup()
    render(
      <I18nextProvider i18n={testI18n}>
        <VerificationProbeDetails
          result={{ summary: "Completed", output: "OK" }}
        />
      </I18nextProvider>,
    )
    const disclosure = screen.getByRole("button", {
      name: "aiApiVerification:verifyDialog.details.result",
    })
    expect(disclosure).toHaveAttribute("aria-expanded", "true")
    await user.click(disclosure)
    expect(disclosure).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByRole("region")).not.toBeInTheDocument()
    await user.keyboard("{Enter}")
    expect(screen.getByRole("region")).toBeVisible()
  })

  it("does not offer execution details for a persisted summary without input or output", () => {
    render(
      <I18nextProvider i18n={testI18n}>
        <VerificationProbeDetails
          controller={buildController()}
          probeId={API_VERIFICATION_PROBE_IDS.TextGeneration}
          result={{ summary: "Previously passed" }}
        />
      </I18nextProvider>,
    )
    expect(
      screen.queryByRole("button", {
        name: "aiApiVerification:verifyDialog.details.result",
      }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole("region")).not.toBeInTheDocument()
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
    expect(
      screen.getByRole("button", {
        name: "aiApiVerification:verifyDialog.tools.prompts.editorLabel",
      }),
    ).toHaveAttribute("aria-expanded", "false")
  })
})
