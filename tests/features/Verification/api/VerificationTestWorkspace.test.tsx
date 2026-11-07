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

  it.each([
    [API_VERIFICATION_PROBE_IDS.Models, ["获取列表", "检查模型", "建议模型"]],
    [
      API_VERIFICATION_PROBE_IDS.TextGeneration,
      ["发送提示词", "接收文本", "检查回复"],
    ],
    [
      API_VERIFICATION_PROBE_IDS.ToolCalling,
      ["定义工具", "请求调用", "检查参数"],
    ],
    [
      API_VERIFICATION_PROBE_IDS.StructuredOutput,
      ["指定结构", "生成 JSON", "校验格式"],
    ],
    [
      API_VERIFICATION_PROBE_IDS.WebSearch,
      ["发起搜索", "检查搜索证据", "查看引用"],
    ],
    [
      API_VERIFICATION_PROBE_IDS.Embedding,
      ["示例文本", "接收向量", "检查维度"],
    ],
    [
      API_VERIFICATION_PROBE_IDS.Rerank,
      ["查询与文档", "请求重排", "检查返回项"],
    ],
    [
      API_VERIFICATION_PROBE_IDS.ImageGeneration,
      ["发送提示词", "接收图像", "预览图片"],
    ],
    [
      API_VERIFICATION_PROBE_IDS.VideoGeneration,
      ["提交视频任务", "查询任务状态", "预览视频"],
    ],
    [API_VERIFICATION_PROBE_IDS.Decision, ["提交状态", "获取决策", "检查结果"]],
  ] as const)("explains the actual %s steps", async (probeId, steps) => {
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
    const flow = screen.getByRole("list", { name: "测试步骤" })
    expect(
      within(flow)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(steps)
  })

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
          result={{
            id: API_VERIFICATION_PROBE_IDS.TextGeneration,
            status: API_VERIFICATION_PROBE_STATUSES.Pass,
            summary: "Previous result",
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
