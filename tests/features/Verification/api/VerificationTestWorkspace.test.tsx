import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useRef, useState } from "react"
import { I18nextProvider } from "react-i18next"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { Modal } from "~/components/ui"
import { VERIFICATION_RAIL_STATUS_VARIANTS } from "~/features/Verification/api/types"
import { VerificationTestSection } from "~/features/Verification/api/VerificationLayout"
import { VerificationProbeDetails } from "~/features/Verification/api/VerificationProbeDetails"
import { VerificationProbeRow } from "~/features/Verification/api/VerificationProbeRow"
import { VerificationResultCard } from "~/features/Verification/api/VerificationResultCard"
import { VerificationSettingsCard } from "~/features/Verification/api/VerificationSettingsCard"
import zhCN from "~/locales/zh-CN/aiApiVerification.json"
import {
  API_VERIFICATION_PROBE_IDS,
  API_VERIFICATION_PROBE_STATUSES,
} from "~/services/verification/aiApiVerification"
import { createResourceTestI18n, testI18n } from "~~/tests/test-utils/i18n"

const viewport = vi.hoisted(() => ({ wide: true }))
vi.mock("~/features/Verification/api/useVerificationWorkspaceHeight", () => ({
  useVerificationWorkspaceHeight: () => ({
    frameRef: useRef(null),
    isWide: viewport.wide,
    isThreeColumn: false,
    availableHeight: 500,
  }),
}))
beforeEach(() => {
  viewport.wide = true
})

describe("Verification test workspace", () => {
  it("keeps the mobile detail outside both sliding panels without resetting its draft", async () => {
    viewport.wide = false
    const user = userEvent.setup()
    render(
      <VerificationTestSection
        tools={null}
        configuration={<input aria-label="API key" />}
      >
        <VerificationProbeDetails label="Text" heading="Text">
          <input aria-label="Prompt" defaultValue="Original" />
        </VerificationProbeDetails>
      </VerificationTestSection>,
    )
    const prompt = screen.getByLabelText("Prompt")
    const tests = screen.getByRole("dialog", { name: /workspace.tests/ })
    expect(tests).not.toContainElement(prompt)
    expect(prompt.closest("[data-verification-detail]")).not.toHaveAttribute(
      "hidden",
    )
    expect(
      screen.queryByRole("textbox", { name: "Prompt" }),
    ).not.toBeInTheDocument()
    await user.click(within(tests).getByRole("button", { name: "Text" }))
    await user.type(screen.getByRole("textbox", { name: "Prompt" }), " edited")
    await user.click(
      screen.getByRole("button", { name: /workspace.expandTests/ }),
    )
    expect(
      screen.getByRole("dialog", { name: /workspace.tests/ }),
    ).not.toContainElement(prompt)
    await user.keyboard("{Escape}")
    await user.click(screen.getByRole("button", { name: /workspace.settings/ }))
    expect(
      screen.getByRole("dialog", { name: /workspace.settings/ }),
    ).not.toContainElement(prompt)
    expect(
      screen.queryByRole("textbox", { name: "Prompt" }),
    ).not.toBeInTheDocument()
    await user.keyboard("{Escape}")
    expect(screen.getByRole("textbox", { name: "Prompt" })).toBe(prompt)
    expect(prompt).toHaveValue("Original edited")
  })
  it("uses the selected test title as the mobile list switcher and keeps its status separate", async () => {
    viewport.wide = false
    const user = userEvent.setup()
    const i18n = await createResourceTestI18n(
      {
        "zh-CN": { aiApiVerification: zhCN },
      },
      "zh-CN",
    )
    render(
      <I18nextProvider i18n={i18n}>
        <VerificationTestSection
          tools={null}
          configuration={<input aria-label="API key" />}
        >
          <VerificationProbeDetails
            label="模型列表"
            heading="模型列表"
            status={<span>待运行</span>}
          />
          <VerificationProbeDetails
            label="上下文容量测试"
            heading="上下文容量测试"
            status={<span>待运行</span>}
          />
        </VerificationTestSection>
      </I18nextProvider>,
    )
    await user.click(screen.getByRole("button", { name: "模型列表" }))
    const switcher = screen.getByRole("button", { name: /模型列表.*展开/ })
    expect(switcher).toHaveTextContent("模型列表")
    expect(switcher).toHaveAttribute("aria-haspopup", "dialog")
    expect(switcher).not.toHaveTextContent("待运行")
    expect(screen.getByRole("group", { name: "模型列表" })).toHaveTextContent(
      "待运行",
    )
    await user.click(switcher)
    await user.click(screen.getByRole("button", { name: "上下文容量测试" }))
    expect(
      screen.getByRole("button", { name: /上下文容量测试.*展开/ }),
    ).toHaveAttribute("aria-expanded", "false")
  })
  it("keeps the selected test runnable when mobile navigation covers its detail action", async () => {
    viewport.wide = false
    const user = userEvent.setup()
    const run = vi.fn()
    render(
      <VerificationTestSection
        tools={null}
        configuration={<input aria-label="API key" />}
      >
        <VerificationProbeDetails
          label="Completed test"
          heading="Completed test"
          action={<button onClick={run}>Run</button>}
          detailAction={<button onClick={run}>Run</button>}
        >
          <p>Saved result</p>
        </VerificationProbeDetails>
      </VerificationTestSection>,
    )
    await user.click(screen.getByRole("button", { name: "Completed test" }))
    expect(screen.getByRole("button", { name: "Run" })).toBeVisible()
    await user.click(
      screen.getByRole("button", { name: /workspace.expandTests/ }),
    )
    await user.click(screen.getByRole("button", { name: "Run" }))
    expect(run).toHaveBeenCalledOnce()
  })
  it("puts selected test settings before general request fields", async () => {
    const user = userEvent.setup()
    render(
      <VerificationTestSection
        tools={null}
        configuration={<input aria-label="API key" />}
      >
        <VerificationProbeDetails
          label="Q&A"
          heading="Q&A"
          settings={<input aria-label="Reference answer" />}
        />
      </VerificationTestSection>,
    )
    await user.click(screen.getByRole("button", { name: /workspace.settings/ }))
    const reference = screen.getByRole("textbox", { name: "Reference answer" })
    expect(
      reference.compareDocumentPosition(
        screen.getByRole("textbox", { name: "API key" }),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })
  it.each(["Tests", "Configuration"])(
    "dismisses %s from the toolbar without a duplicate close over its content",
    async (sidebar) => {
      viewport.wide = false
      const user = userEvent.setup()
      render(
        <VerificationTestSection
          tools={null}
          configuration={
            <input aria-label="API key" defaultValue="draft-key" />
          }
        >
          <VerificationProbeDetails label="Text" heading="Text">
            <p>Current test</p>
          </VerificationProbeDetails>
        </VerificationTestSection>,
      )
      const settings = screen.getByRole("button", {
        name: /workspace.settings/,
      })
      if (sidebar === "Configuration") await user.click(settings)
      const panel = screen.getByRole("dialog", {
        name: sidebar === "Tests" ? /workspace.tests/ : /workspace.settings/,
      })
      expect(
        within(panel).queryByRole("button", { name: /actions.close/ }),
      ).not.toBeInTheDocument()
      const toggle =
        sidebar === "Tests"
          ? screen.getByRole("button", { name: /workspace.collapseTests/ })
          : settings
      await user.click(toggle)
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
      expect(toggle).toHaveFocus()
      await user.click(toggle)
      const reopened = screen.getByRole("dialog", {
        name: sidebar === "Tests" ? /workspace.tests/ : /workspace.settings/,
      })
      if (sidebar === "Configuration")
        expect(
          within(reopened).getByRole("textbox", { name: "API key" }),
        ).toHaveValue("draft-key")
      await user.keyboard("{Escape}")
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
      expect(toggle).toHaveFocus()
    },
  )
  it.each([
    { status: "unsupported" as const, summaryKey: undefined, label: "不支持" },
    {
      status: "fail" as const,
      summaryKey: "verifyDialog.summaries.requestTimedOut" as const,
      label: "请求超时",
    },
    {
      status: "fail" as const,
      summaryKey: "verifyDialog.summaries.stopped" as const,
      label: "已停止",
    },
  ])(
    "preserves $label in collapsed tooltips and accessible descriptions",
    async ({ status, summaryKey, label }) => {
      const user = userEvent.setup()
      const i18n = await createResourceTestI18n(
        { "zh-CN": { aiApiVerification: zhCN } },
        "zh-CN",
      )
      render(
        <I18nextProvider i18n={i18n}>
          <VerificationTestSection
            tools={null}
            configuration={<input aria-label="API key" />}
          >
            <VerificationProbeRow
              probeId="structured-output"
              result={{
                id: "structured-output",
                status,
                summaryKey,
                summary: "Saved result",
                latencyMs: 100,
              }}
              runButtonProps={{ children: "Run" }}
            />
          </VerificationTestSection>
        </I18nextProvider>,
      )
      await user.click(
        screen.getByRole("button", {
          name: `${zhCN.verifyDialog.workspace.tests} · ${zhCN.verifyDialog.workspace.collapseTests}`,
        }),
      )
      const item = screen.getByRole("button", {
        name: "结构化输出",
      })
      await user.hover(item)
      expect(await screen.findByRole("tooltip")).toHaveTextContent(label)
      expect(item).toHaveAccessibleDescription(new RegExp(label))
    },
  )
  it.each([
    { wide: false, actionLabel: "Stop" },
    { wide: true, actionLabel: "Stop" },
    { wide: false, actionLabel: "Continue" },
    { wide: true, actionLabel: "Continue" },
  ])(
    "keeps $actionLabel accessible after collapsing the test list (wide=$wide)",
    async ({ wide, actionLabel }) => {
      viewport.wide = wide
      const user = userEvent.setup()
      const onAction = vi.fn()
      render(
        <VerificationTestSection
          tools={null}
          configuration={<input aria-label="API key" />}
        >
          <VerificationProbeDetails
            label="Context capacity"
            heading="Context capacity"
            action={<button onClick={onAction}>{actionLabel}</button>}
          >
            <p>Current capacity result</p>
          </VerificationProbeDetails>
        </VerificationTestSection>,
      )
      await user.click(screen.getByRole("button", { name: "Context capacity" }))
      if (wide)
        await user.click(
          screen.getByRole("button", { name: /workspace.collapseTests/ }),
        )
      const action = within(
        screen.getByTestId("verification-active-test"),
      ).getByRole("button", { name: actionLabel })
      expect(action).toBeVisible()
      await user.click(action)
      expect(onAction).toHaveBeenCalledOnce()
    },
  )
  it("hides covered mobile detail controls from keyboard and screen readers while settings are open", async () => {
    viewport.wide = false
    const user = userEvent.setup()
    render(
      <VerificationTestSection
        tools={null}
        configuration={<input aria-label="API key" />}
      >
        <VerificationProbeDetails label="Text" heading="Text">
          <input aria-label="Prompt" />
        </VerificationProbeDetails>
      </VerificationTestSection>,
    )
    await user.click(screen.getByRole("button", { name: "Text" }))
    const prompt = screen.getByRole("textbox", { name: "Prompt" })
    await user.click(screen.getByRole("button", { name: /workspace.settings/ }))
    expect(
      screen.queryByRole("textbox", { name: "Prompt" }),
    ).not.toBeInTheDocument()
    expect(prompt).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /workspace.settings/ }))
    expect(screen.getByRole("textbox", { name: "Prompt" })).toBe(prompt)
  })
  it.each(["Tests", "Configuration"])(
    "closes the enclosing API dialog in one click while %s is open",
    async (sidebarName) => {
      viewport.wide = false
      const user = userEvent.setup()
      function ApiTester() {
        const [open, setOpen] = useState(true)
        return (
          <Modal
            isOpen={open}
            onClose={() => setOpen(false)}
            header={<h1>API tester</h1>}
            panelTestId="api-test-dialog"
          >
            <VerificationTestSection
              tools={null}
              configuration={<input aria-label="API key" />}
            >
              <VerificationProbeDetails label="Models" heading="Models">
                <p>Fetch available models</p>
              </VerificationProbeDetails>
            </VerificationTestSection>
          </Modal>
        )
      }
      render(<ApiTester />)
      const panel = screen.getByTestId("api-test-dialog")
      const close = within(panel).getAllByRole("button", {
        name: /actions.close/,
      })[0]!
      if (sidebarName === "Configuration")
        await user.click(
          screen.getByRole("button", { name: /workspace.settings/ }),
        )
      await user.click(close)
      await waitFor(() =>
        expect(screen.queryByTestId("api-test-dialog")).not.toBeInTheDocument(),
      )
    },
  )
  it("starts a small workspace with test selection and opens the chosen detail", async () => {
    viewport.wide = false
    const user = userEvent.setup()
    render(
      <VerificationTestSection
        tools={null}
        configuration={<p>Configuration</p>}
      >
        <VerificationProbeDetails label="Models" heading="Models">
          <p>Fetch available models</p>
        </VerificationProbeDetails>
      </VerificationTestSection>,
    )
    const tests = screen.getByRole("dialog", { name: /workspace.tests/ })
    expect(tests).toBeVisible()
    expect(
      screen
        .getByText("Fetch available models")
        .closest("[data-verification-detail]"),
    ).toHaveAttribute("aria-hidden", "true")
    expect(
      screen.getByRole("button", { name: /workspace.collapseTests/ }),
    ).toHaveAttribute("aria-expanded", "true")
    await user.click(within(tests).getByRole("button", { name: "Models" }))
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(screen.getByText("Fetch available models")).toBeVisible()
  })
  it("shows one mobile sidebar at a time and retains both editors across drawer and split layouts", async () => {
    viewport.wide = false
    const user = userEvent.setup()
    const workspace = () => (
      <VerificationTestSection
        tools={null}
        initialSettingsOpen
        configuration={<input aria-label="API key" />}
      >
        <VerificationProbeDetails label="Text" heading="Text">
          <input aria-label="Prompt" defaultValue="Original" />
        </VerificationProbeDetails>
      </VerificationTestSection>
    )
    const { rerender } = render(workspace())
    const key = screen.getByRole("textbox", { name: "API key" })
    await user.type(key, "draft-key")
    expect(screen.getAllByRole("dialog")).toHaveLength(1)
    await user.click(screen.getByRole("button", { name: /workspace.settings/ }))
    const draft = screen.getByRole("textbox", { name: "Prompt" })
    await user.type(draft, " edited")
    await user.click(
      screen.getByRole("button", { name: /workspace.expandTests/ }),
    )
    expect(screen.getAllByRole("dialog")).toHaveLength(1)
    expect(
      screen.getByRole("dialog", { name: /workspace.tests/ }),
    ).toHaveAttribute("data-side", "left")
    viewport.wide = true
    rerender(workspace())
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(screen.getByRole("textbox", { name: "Prompt" })).toBe(draft)
    await user.click(screen.getByRole("button", { name: /workspace.settings/ }))
    expect(screen.getByRole("textbox", { name: "API key" })).toBe(key)
    viewport.wide = false
    rerender(workspace())
    expect(screen.getAllByRole("dialog")).toHaveLength(1)
    expect(
      screen.getByRole("dialog", { name: /workspace.settings/ }),
    ).toHaveAttribute("data-side", "right")
    expect(key).toHaveValue("draft-key")
    await user.click(screen.getByRole("button", { name: /workspace.settings/ }))
    expect(screen.getByRole("textbox", { name: "Prompt" })).toBe(draft)
    expect(draft).toHaveValue("Original edited")
  })
  it("uses one selected-test settings heading and keeps its fields mounted when folded", async () => {
    const user = userEvent.setup()
    render(
      <VerificationTestSection
        tools={null}
        initialSettingsOpen
        configuration={<p>Request settings</p>}
      >
        <VerificationProbeDetails
          label="Needle"
          heading="Needle"
          settings={
            <VerificationSettingsCard>
              <input aria-label="Context length" defaultValue="16384" />
            </VerificationSettingsCard>
          }
        />
      </VerificationTestSection>,
    )
    const heading = screen.getByRole("heading", {
      name: /workspace.currentTest.*Needle/,
    })
    expect(
      screen.queryByRole("heading", { name: /tools.settingsTitle/ }),
    ).not.toBeInTheDocument()
    const field = screen.getByRole("textbox", { name: "Context length" })
    await user.type(field, "0")
    await user.click(within(heading).getByRole("button"))
    expect(field).toBeInTheDocument()
    expect(field).not.toBeVisible()
    await user.click(within(heading).getByRole("button"))
    expect(screen.getByRole("textbox", { name: "Context length" })).toBe(field)
    expect(field).toHaveValue("163840")
  })
  it("uses a mobile tests sheet with toolbar, Escape and outside dismissal without remounting the detail", async () => {
    viewport.wide = false
    const user = userEvent.setup()
    render(
      <VerificationTestSection
        tools={null}
        configuration={<input aria-label="API key" />}
      >
        <VerificationProbeDetails label="Text" heading="Text">
          <input aria-label="Prompt" defaultValue="Original" />
        </VerificationProbeDetails>
        <VerificationProbeDetails label="Models" heading="Models">
          <p>Model results</p>
        </VerificationProbeDetails>
      </VerificationTestSection>,
    )
    const draft = screen.getByLabelText("Prompt")
    const sheet = screen.getByRole("dialog", { name: /workspace.tests/ })
    expect(sheet).toHaveAccessibleName(/workspace.tests/)
    await user.click(within(sheet).getByRole("button", { name: "Text" }))
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    await user.type(screen.getByRole("textbox", { name: "Prompt" }), " edited")
    const expand = screen.getByRole("button", { name: /workspace.expandTests/ })
    await user.click(expand)
    await user.click(
      screen.getByRole("button", { name: /workspace.collapseTests/ }),
    )
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(screen.getByRole("textbox", { name: "Prompt" })).toBe(draft)
    await user.click(expand)
    await user.keyboard("{Escape}")
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(expand).toHaveFocus()
    await user.click(expand)
    fireEvent.pointerDown(document.body, { button: 0, pointerType: "mouse" })
    fireEvent.click(document.body)
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(screen.getByRole("textbox", { name: "Prompt" })).toBe(draft)
    expect(draft).toHaveValue("Original edited")
  })
  it("opens the selected mobile detail in place of the full test list and preserves its draft", async () => {
    viewport.wide = false
    const user = userEvent.setup()
    render(
      <VerificationTestSection
        tools={null}
        configuration={<p>Configuration</p>}
      >
        <VerificationProbeDetails label="Text" heading="Text">
          <input aria-label="Prompt" defaultValue="Original" />
        </VerificationProbeDetails>
        <VerificationProbeDetails label="Models" heading="Models">
          <p>Model results</p>
        </VerificationProbeDetails>
      </VerificationTestSection>,
    )
    const input = screen.getByLabelText("Prompt")
    expect(screen.getByRole("button", { name: "Text" })).toHaveAttribute(
      "aria-expanded",
      "false",
    )
    await user.click(screen.getByRole("button", { name: "Text" }))
    const expand = screen.getByRole("button", { name: /workspace.expandTests/ })
    expect(expand).toHaveAttribute("aria-expanded", "false")
    await waitFor(() => expect(expand).toHaveFocus())
    await user.type(screen.getByRole("textbox", { name: "Prompt" }), " edited")
    await user.click(expand)
    expect(input).toBeInTheDocument()
    expect(
      screen.queryByRole("textbox", { name: "Prompt" }),
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Models" }))
    expect(screen.getByText("Model results")).toBeVisible()
    await user.click(
      screen.getByRole("button", { name: /workspace.expandTests/ }),
    )
    await user.click(screen.getByRole("button", { name: "Text" }))
    expect(screen.getByRole("textbox", { name: "Prompt" })).toBe(input)
    expect(input).toHaveValue("Original edited")
  })
  it("retains configuration when credential preparation replaces the narrow drawer", async () => {
    viewport.wide = false
    const user = userEvent.setup()
    const workspace = (preparing: boolean) => (
      <VerificationTestSection
        children={null}
        tools={null}
        initialSettingsOpen
        preparing={preparing}
        configuration={<input aria-label="API key" />}
      />
    )
    const { rerender } = render(workspace(true))
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    const input = screen.getByRole("textbox", { name: "API key" })
    await user.type(input, "Draft during preparation")
    rerender(workspace(false))
    expect(
      within(screen.getByRole("dialog")).getByRole("textbox", {
        name: "API key",
      }),
    ).toBe(input)
    rerender(workspace(true))
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(screen.getByRole("textbox", { name: "API key" })).toBe(input)
    expect(input).toHaveValue("Draft during preparation")
  })
  it("closes desktop settings with Escape from a general configuration editor", async () => {
    const user = userEvent.setup()
    render(
      <VerificationTestSection
        children={null}
        tools={null}
        initialSettingsOpen
        configuration={<input aria-label="API key" />}
      />,
    )
    await user.click(screen.getByRole("textbox", { name: "API key" }))
    await user.keyboard("{Escape}")
    expect(
      screen.getByRole("button", { name: /workspace.settings/ }),
    ).toHaveAttribute("aria-expanded", "false")
  })
  it("opens a narrow settings sheet with an accessible name and X close button while retaining every editor", async () => {
    viewport.wide = false
    const user = userEvent.setup()
    render(
      <VerificationTestSection
        tools={null}
        configuration={<input aria-label="API key" />}
      >
        <VerificationProbeDetails
          label="Text"
          heading="Text"
          settings={<input aria-label="Prompt" defaultValue="Original" />}
        >
          <p>Selected response</p>
        </VerificationProbeDetails>
      </VerificationTestSection>,
    )
    await user.click(screen.getByRole("button", { name: "Text" }))
    const toggle = screen.getByRole("button", { name: /workspace.settings/ })
    await user.click(toggle)
    const sheet = screen.getByRole("dialog", { name: /workspace.settings/ })
    expect(sheet).toHaveAccessibleName(/workspace.settings/)
    const key = within(sheet).getByRole("textbox", { name: "API key" })
    const prompt = within(sheet).getByRole("textbox", { name: "Prompt" })
    await user.type(key, "draft-key")
    await user.type(prompt, " edited")
    await user.click(toggle)
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(key).toBeInTheDocument()
    expect(prompt).toBeInTheDocument()
    expect(toggle).toHaveFocus()
    expect(screen.getByText("Selected response")).toBeVisible()
    await user.click(toggle)
    expect(screen.getByRole("textbox", { name: "API key" })).toBe(key)
    expect(key).toHaveValue("draft-key")
    expect(screen.getByRole("textbox", { name: "Prompt" })).toBe(prompt)
    expect(prompt).toHaveValue("Original edited")
  })
  it("closes the narrow sheet with Escape and an outside interaction without discarding its draft", async () => {
    viewport.wide = false
    const user = userEvent.setup()
    render(
      <VerificationTestSection
        children={null}
        tools={null}
        configuration={<input aria-label="API key" />}
      />,
    )
    const toggle = screen.getByRole("button", { name: /workspace.settings/ })
    await user.click(toggle)
    const input = screen.getByRole("textbox", { name: "API key" })
    await user.type(input, "Keep me")
    await user.keyboard("{Escape}")
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(toggle).toHaveFocus()
    await user.click(toggle)
    fireEvent.pointerDown(document.body, { button: 0, pointerType: "mouse" })
    fireEvent.click(document.body)
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    await user.click(toggle)
    expect(screen.getByRole("textbox", { name: "API key" })).toBe(input)
    expect(input).toHaveValue("Keep me")
  })

  it("preserves editors while the open settings panel switches between drawer and split view", async () => {
    viewport.wide = false
    const user = userEvent.setup()
    const workspace = () => (
      <VerificationTestSection
        children={null}
        tools={null}
        initialSettingsOpen
        configuration={<input aria-label="API key" />}
      />
    )
    const { rerender } = render(workspace())
    const input = screen.getByRole("textbox", { name: "API key" })
    await user.type(input, "Keep across resize")
    viewport.wide = true
    rerender(workspace())
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(screen.getByRole("textbox", { name: "API key" })).toBe(input)
    viewport.wide = false
    rerender(workspace())
    expect(
      within(screen.getByRole("dialog")).getByRole("textbox", {
        name: "API key",
      }),
    ).toBe(input)
    expect(input).toHaveValue("Keep across resize")
  })
  it("opens performance details from the test header and closes them when switching tests", async () => {
    const user = userEvent.setup()
    render(
      <VerificationTestSection
        tools={null}
        configuration={<input aria-label="Connection" />}
      >
        <VerificationProbeDetails
          label="Text"
          heading="Text"
          result={{
            summary: "",
            output: "Answer",
            metrics: [{ responseTimeMs: 120, outputTokens: 21 }],
          }}
        />
        <VerificationProbeDetails label="Drawing" heading="Drawing" />
      </VerificationTestSection>,
    )
    const header = screen.getByRole("group", { name: "Text" })
    await user.click(
      within(header).getByRole("button", { name: /generation.statistics/ }),
    )
    const statistics = screen.getByRole("dialog", {
      name: /generation.statistics/,
    })
    expect(statistics).toHaveTextContent("120ms")
    await user.click(screen.getByRole("button", { name: "Drawing" }))
    expect(statistics).not.toBeInTheDocument()
  })
  it("keeps the selected test's name, status and conclusion in the header without repeating them above its answer", async () => {
    const user = userEvent.setup()
    render(
      <VerificationTestSection
        tools={null}
        configuration={<input aria-label="Connection" />}
      >
        <VerificationProbeDetails
          label="Text"
          heading="Text"
          status={<span>Passed · 25ms</span>}
          result={{ summary: "Text completed", output: "Model reply" }}
        />
        <VerificationProbeDetails
          label="Drawing"
          heading="Drawing"
          status={<span>Drawing pending</span>}
        />
      </VerificationTestSection>,
    )
    const header = screen.getByRole("group", { name: "Text" })
    expect(within(header).getByText("Text")).toBeVisible()
    expect(within(header).getByText("Passed · 25ms")).toBeVisible()
    expect(within(header).getByText("Text completed")).toBeVisible()
    const result = screen.getByRole("region", { name: /details.result/ })
    expect(within(result).getByText("Model reply")).toBeVisible()
    expect(
      within(result).queryByRole("heading", { name: /details.result/ }),
    ).not.toBeInTheDocument()
    expect(within(result).queryByText("Text completed")).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Drawing" }))
    const drawingHeader = screen.getByRole("group", {
      name: "Drawing",
    })
    expect(within(drawingHeader).getByText("Drawing pending")).toBeVisible()
    expect(within(drawingHeader).queryByText("Passed · 25ms")).not.toBeVisible()
  })
  it("places structured conclusions and result actions in the selected test header and leaves only evidence in the result", () => {
    render(
      <VerificationTestSection
        tools={null}
        configuration={<input aria-label="Connection" />}
      >
        <VerificationProbeDetails
          label="Needle"
          heading="Needle"
          status={<span>Stopped</span>}
        >
          <VerificationResultCard
            summary={
              <div>
                <p>Cumulative matches: 4/6</p>
                <p>Latest run: 2/2</p>
              </div>
            }
            status={<button type="button">Run remaining</button>}
          >
            <p>Matrix evidence</p>
          </VerificationResultCard>
        </VerificationProbeDetails>
      </VerificationTestSection>,
    )
    const header = screen.getByRole("group", { name: "Needle" })
    expect(within(header).getByText("Cumulative matches: 4/6")).toBeVisible()
    expect(within(header).getByText("Latest run: 2/2")).toBeVisible()
    expect(
      within(header).getByRole("button", { name: "Run remaining" }),
    ).toBeVisible()
    const result = screen.getByRole("region", { name: /details.result/ })
    expect(result).toHaveTextContent(/^Matrix evidence$/)
  })
  it("does not steal focus from an editor after opening settings", async () => {
    const user = userEvent.setup()
    render(
      <VerificationTestSection
        configuration={<input aria-label="Connection" />}
        tools={null}
      >
        <VerificationProbeDetails label="Text" heading="Text">
          <p>Selected response</p>
        </VerificationProbeDetails>
      </VerificationTestSection>,
    )
    let nextFrame: FrameRequestCallback | undefined
    const animationFrame = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        nextFrame = callback
        return 1
      })
    try {
      await user.click(
        screen.getByRole("button", { name: /workspace.settings/ }),
      )
      const editor = screen.getByRole("textbox", { name: "Connection" })
      await user.click(editor)
      nextFrame?.(0)
      expect(editor).toHaveFocus()
      await user.keyboard("Keep typing")
      expect(editor).toHaveValue("Keep typing")
    } finally {
      animationFrame.mockRestore()
    }
  })

  it("collapses each sidebar independently without hiding the selected result or losing drafts", async () => {
    const user = userEvent.setup()
    render(
      <VerificationTestSection
        configuration={<input aria-label="Connection" />}
        tools={null}
        initialSettingsOpen
      >
        <VerificationProbeDetails
          label="Text"
          heading="Text"
          settings={<input aria-label="Prompt" defaultValue="Keep me" />}
        >
          <p>Selected response</p>
        </VerificationProbeDetails>
      </VerificationTestSection>,
    )
    const prompt = screen.getByRole("textbox", { name: "Prompt" })
    await user.type(prompt, " edited")
    await user.click(
      screen.getByRole("button", { name: /workspace.collapseTests/ }),
    )
    expect(screen.getByRole("button", { name: "Text" })).toBeInTheDocument()
    expect(screen.getByText("Selected response")).toBeVisible()
    expect(prompt).toBeVisible()
    const settingsToggle = screen.getByRole("button", {
      name: /workspace.settings/,
    })
    await user.click(settingsToggle)
    expect(
      screen.queryByRole("textbox", { name: "Prompt" }),
    ).not.toBeInTheDocument()
    expect(screen.getByText("Selected response")).toBeVisible()
    const expand = screen.getByRole("button", { name: /workspace.expandTests/ })
    expect(expand).toHaveAttribute("aria-expanded", "false")
    await user.click(expand)
    expect(screen.getByRole("button", { name: "Text" })).toBeVisible()
    expect(
      screen.queryByRole("textbox", { name: "Prompt" }),
    ).not.toBeInTheDocument()
    await user.click(settingsToggle)
    expect(screen.getByRole("textbox", { name: "Prompt" })).toBe(prompt)
    expect(prompt).toHaveValue("Keep me edited")
  })

  it("retains compact test switching in a collapsed rail and allows switching tests while collapsed", async () => {
    const user = userEvent.setup()
    render(
      <VerificationTestSection
        tools={null}
        configuration={<input aria-label="Connection" />}
      >
        <VerificationProbeDetails
          label="Text"
          heading="Text"
          status={<span>Passed</span>}
        >
          <p>Text output</p>
        </VerificationProbeDetails>
        <VerificationProbeDetails
          label="Drawing"
          heading="Drawing"
          status={<span>Pending</span>}
        >
          <p>Drawing output</p>
        </VerificationProbeDetails>
      </VerificationTestSection>,
    )

    expect(screen.getByText("Text output")).toBeVisible()

    // Collapse the test list
    await user.click(
      screen.getByRole("button", { name: /workspace.collapseTests/ }),
    )

    // The test item buttons should still be available in the collapsed rail
    const drawingButton = screen.getByRole("button", { name: "Drawing" })
    expect(drawingButton).toBeInTheDocument()

    // Switching tests while collapsed works directly
    await user.click(drawingButton)
    expect(screen.getByText("Drawing output")).toBeVisible()
    expect(screen.queryByText("Text output")).not.toBeVisible()
    expect(drawingButton).toHaveAttribute("aria-expanded", "true")
  })

  it("renders status indicators on rail buttons when tests are collapsed", async () => {
    const user = userEvent.setup()
    render(
      <VerificationTestSection
        tools={null}
        configuration={<input aria-label="Connection" />}
      >
        <VerificationProbeDetails
          label="Text"
          heading="Text"
          statusVariant={VERIFICATION_RAIL_STATUS_VARIANTS.Success}
        />
        <VerificationProbeDetails
          label="Drawing"
          heading="Drawing"
          statusVariant={VERIFICATION_RAIL_STATUS_VARIANTS.Danger}
        />
        <VerificationProbeDetails
          label="Tools"
          heading="Tools"
          statusVariant={VERIFICATION_RAIL_STATUS_VARIANTS.Running}
        />
        <VerificationProbeDetails
          label="Search"
          heading="Search"
          statusVariant={VERIFICATION_RAIL_STATUS_VARIANTS.Warning}
        />
      </VerificationTestSection>,
    )

    // Collapse list
    await user.click(
      screen.getByRole("button", { name: /workspace.collapseTests/ }),
    )

    expect(
      screen.getByTestId("verification-rail-status-success"),
    ).toBeInTheDocument()
    expect(
      screen.getByTestId("verification-rail-status-danger"),
    ).toBeInTheDocument()
    expect(
      screen.getByTestId("verification-rail-status-running"),
    ).toBeInTheDocument()
    expect(
      screen.getByTestId("verification-rail-status-warning"),
    ).toBeInTheDocument()
  })

  it("renders readable tooltip content without embedded badges in collapsed rail", async () => {
    const user = userEvent.setup()
    render(
      <VerificationTestSection
        tools={null}
        configuration={<input aria-label="Connection" />}
      >
        <VerificationProbeDetails
          label="Drawing"
          heading="Drawing"
          status={<span>Pending</span>}
        />
        <VerificationProbeDetails
          label="Text"
          heading="Text"
          statusVariant={VERIFICATION_RAIL_STATUS_VARIANTS.Success}
        />
      </VerificationTestSection>,
    )

    // Collapse list
    await user.click(
      screen.getByRole("button", { name: /workspace.collapseTests/ }),
    )

    const drawingButton = screen.getByRole("button", { name: "Drawing" })
    await user.hover(drawingButton)

    const tooltip = await screen.findByRole("tooltip")
    expect(tooltip).toHaveTextContent("Drawing")
    expect(tooltip.querySelector(".border")).toBeNull()
  })

  it("keeps each test's settings draft when switching tests and closing the settings panel", async () => {
    const user = userEvent.setup()
    render(
      <VerificationTestSection
        tools={null}
        configuration={
          <label>
            API key
            <input />
          </label>
        }
      >
        <VerificationProbeDetails
          label="Text"
          heading="Text"
          settings={
            <label>
              Text prompt
              <input defaultValue="Original" />
            </label>
          }
        >
          <p>Text output</p>
        </VerificationProbeDetails>
        <VerificationProbeDetails
          label="Drawing"
          heading="Drawing"
          settings={
            <label>
              Drawing prompt
              <input defaultValue="Draw" />
            </label>
          }
        >
          <p>Drawing output</p>
        </VerificationProbeDetails>
      </VerificationTestSection>,
    )
    const toggle = screen.getByRole("button", { name: /workspace.settings/ })
    await user.click(toggle)
    const input = screen.getByRole("textbox", { name: "Text prompt" })
    await user.clear(input)
    await user.type(input, "Keep edited prompt")
    await user.click(screen.getByRole("button", { name: "Drawing" }))
    expect(input).not.toBeVisible()
    expect(
      screen.getByRole("textbox", { name: "Drawing prompt" }),
    ).toBeVisible()
    await user.click(toggle)
    await user.click(screen.getByRole("button", { name: "Text" }))
    await user.click(toggle)
    expect(screen.getByRole("textbox", { name: "Text prompt" })).toBe(input)
    expect(input).toHaveValue("Keep edited prompt")
    expect(screen.getByText("Text output")).toBeVisible()
    await user.click(input)
    await user.keyboard("{Escape}")
    expect(toggle).toHaveAttribute("aria-expanded", "false")
    expect(toggle).toHaveFocus()
  })

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
