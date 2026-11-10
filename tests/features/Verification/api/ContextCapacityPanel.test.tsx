import { webcrypto } from "node:crypto"
import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { I18nextProvider } from "react-i18next"
import { expect, it, vi } from "vitest"

import { ContextCapacityPanel } from "~/features/Verification/api/ContextCapacityPanel"
import { useContextCapacity } from "~/features/Verification/api/useContextCapacity"
import { VerificationTestSection } from "~/features/Verification/api/VerificationLayout"
import { VerificationProbeDetails } from "~/features/Verification/api/VerificationProbeDetails"
import zhCN from "~/locales/zh-CN/aiApiVerification.json"
import {
  CONTEXT_ATTEMPT_FAILURE_REASONS,
  CONTEXT_ATTEMPT_OUTCOMES,
  CONTEXT_CAPACITY_REASONS,
} from "~/services/verification/modelQuality/contextCapacityConstants"
import type {
  ContextCapacityRunResult,
  RunContextCapacityParams,
} from "~/services/verification/modelQuality/contextCapacityRun"
import { contextCapacityHistory } from "~/services/verification/verificationResultHistory/contextCapacityHistory"
import { verificationResultHistoryStorage } from "~/services/verification/verificationResultHistory/storage"
import { CONTEXT_CAPACITY_INCONCLUSIVE_REASONS } from "~/services/verification/verificationResultHistory/types"
import { createResourceTestI18n, testI18n } from "~~/tests/test-utils/i18n"

it("offers continuation without duplicate failure copy when a budget pause has no accepted input", () => {
  render(
    <I18nextProvider i18n={testI18n}>
      <ContextCapacityPanel
        controller={{
          enabled: true,
          running: false,
          canRun: true,
          stopped: false,
          progress: null,
          error: null,
          run: vi.fn(),
          stop: vi.fn(),
          result: {
            reason: CONTEXT_CAPACITY_REASONS.Budget,
            lowerBoundTokens: 0,
            attempts: [],
            counter: { encoding: "o200k_base", estimated: true },
          },
        }}
      />
    </I18nextProvider>,
  )
  expect(
    screen.getAllByText(
      "aiApiVerification:verifyDialog.tools.context.pausedTitle",
    ),
  ).toHaveLength(1)
  expect(
    screen.getByRole("button", {
      name: "aiApiVerification:verifyDialog.tools.context.continue",
    }),
  ).toBeEnabled()
  expect(
    screen.queryByText(
      "aiApiVerification:verifyDialog.tools.context.unableTitle",
    ),
  ).not.toBeInTheDocument()
})

it("places context help before status without nesting it in the selection button", async () => {
  const user = userEvent.setup()
  const run = vi.fn()
  const i18n = await createResourceTestI18n(
    { "zh-CN": { aiApiVerification: zhCN } },
    "zh-CN",
  )
  render(
    <I18nextProvider i18n={i18n}>
      <VerificationTestSection
        tools={
          <ContextCapacityPanel
            controller={{
              enabled: true,
              canRun: true,
              running: false,
              stopped: false,
              progress: null,
              result: null,
              error: null,
              run,
              stop: vi.fn(),
            }}
          />
        }
      >
        <VerificationProbeDetails
          label="Models"
          heading={<span>Models</span>}
        />
      </VerificationTestSection>
    </I18nextProvider>,
  )
  const select = screen.getByRole("button", { name: "模型上下文测试" })
  const help = screen.getByRole("button", {
    name: zhCN.verifyDialog.tools.context.about,
  })
  const status = within(
    select.closest("[data-verification-summary]")! as HTMLElement,
  ).getByText("待运行")
  expect(
    help.compareDocumentPosition(status) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy()
  expect(help.parentElement?.closest("button")).toBeNull()
  await user.click(help)
  expect(select).toHaveAttribute("aria-expanded", "false")
  expect(run).not.toHaveBeenCalled()
  await user.tab({ shift: true })
  expect(select).toHaveFocus()
  await user.keyboard("{Enter}")
  expect(select).toHaveAttribute("aria-expanded", "true")
})

it("runs context probing from the inline hint only when allowed", async () => {
  const user = userEvent.setup()
  const run = vi.fn()
  const i18n = await createResourceTestI18n(
    { "zh-CN": { aiApiVerification: zhCN } },
    "zh-CN",
  )
  const panel = (canRun: boolean) => (
    <I18nextProvider i18n={i18n}>
      <ContextCapacityPanel
        controller={{
          enabled: true,
          canRun,
          running: false,
          stopped: false,
          progress: null,
          result: null,
          error: null,
          run,
          stop: vi.fn(),
        }}
      />
    </I18nextProvider>
  )
  const { rerender } = render(panel(false))
  const inlineRun = screen.getByRole("button", { name: "运行" })
  expect(inlineRun).toBeDisabled()
  await user.click(inlineRun)
  expect(run).not.toHaveBeenCalled()
  rerender(panel(true))
  await user.click(inlineRun)
  expect(run).toHaveBeenCalledOnce()
})

it.each([
  { running: false, stopped: false, error: null, idle: true },
  { running: true, stopped: false, error: null, idle: false },
  { running: false, stopped: true, error: null, idle: false },
  { running: false, stopped: false, error: "Request failed", idle: false },
])(
  "shows context instructions only for an idle test: $idle",
  ({ idle, ...state }) => {
    render(
      <I18nextProvider i18n={testI18n}>
        <ContextCapacityPanel
          controller={{
            enabled: true,
            canRun: true,
            progress: null,
            result: null,
            run: vi.fn(),
            stop: vi.fn(),
            ...state,
          }}
        />
      </I18nextProvider>,
    )
    const intro = screen.queryByText(
      "aiApiVerification:verifyDialog.intro.startHint",
    )
    if (idle) {
      expect(intro).toBeVisible()
      expect(
        screen.getByText("aiApiVerification:verifyDialog.tools.context.hint"),
      ).toBeVisible()
    } else expect(intro).not.toBeInTheDocument()
  },
)

it.each([
  {
    reason: CONTEXT_CAPACITY_REASONS.Inconclusive,
    failureReason: CONTEXT_ATTEMPT_FAILURE_REASONS.Timeout,
    label: "请求超时",
    explanation: "超时不能证明输入超过模型容量",
  },
  {
    reason: CONTEXT_CAPACITY_REASONS.Inconclusive,
    finishReason: "stop",
    label: "未返回正文",
    explanation: "接口正常结束但未返回正文",
  },
  {
    reason: CONTEXT_CAPACITY_REASONS.Inconclusive,
    label: "未能确认",
    explanation: "未获得可判断的结果",
  },
  {
    reason: CONTEXT_CAPACITY_REASONS.Budget,
    label: "已暂停",
    explanation: "已达到本批请求或累计输入预算",
  },
  { reason: CONTEXT_CAPACITY_REASONS.Stopped, label: "已停止" },
] as const)("shows $label in the context result badge", async (scenario) => {
  const i18n = await createResourceTestI18n(
    { "zh-CN": { aiApiVerification: zhCN } },
    "zh-CN",
  )
  render(
    <I18nextProvider i18n={i18n}>
      <ContextCapacityPanel
        controller={{
          enabled: true,
          running: false,
          canRun: true,
          progress: null,
          error: null,
          stopped: scenario.reason === "stopped",
          run: vi.fn(),
          stop: vi.fn(),
          result: {
            lowerBoundTokens: 0,
            reason: scenario.reason,
            attempts: [
              {
                targetTokens: 1048576,
                outcome: CONTEXT_ATTEMPT_OUTCOMES.Inconclusive,
                ...("failureReason" in scenario
                  ? { failureReason: scenario.failureReason }
                  : {}),
                ...("finishReason" in scenario
                  ? { finishReason: scenario.finishReason }
                  : {}),
                message: "signal timed out",
              },
            ],
            counter: { encoding: "o200k_base", estimated: true },
          },
        }}
      />
    </I18nextProvider>,
  )
  expect(
    screen.getByText(scenario.label).closest('[data-slot="badge"]'),
  ).toBeVisible()
  if (scenario.explanation) {
    expect(
      within(screen.getByRole("status", { name: "上下文探测结果" })).getByText(
        new RegExp(scenario.explanation),
      ),
    ).toBeVisible()
  }
})

it.each([
  {
    lower: 65536,
    reason: CONTEXT_CAPACITY_REASONS.Bracketed,
    percent: "50",
    tone: "bg-warning-soft",
    historical: false,
  },
  {
    lower: 130990,
    reason: CONTEXT_CAPACITY_REASONS.TestLimit,
    percent: "99.9",
    tone: "bg-success-soft",
    historical: false,
  },
  {
    lower: 65536,
    reason: CONTEXT_CAPACITY_REASONS.Budget,
    percent: "50",
    tone: "bg-secondary",
    historical: false,
  },
  {
    lower: 65536,
    reason: CONTEXT_CAPACITY_REASONS.Inconclusive,
    percent: "50",
    tone: "bg-secondary",
    historical: false,
  },
  {
    lower: 65536,
    reason: CONTEXT_CAPACITY_REASONS.Bracketed,
    percent: "50",
    tone: "bg-warning-soft",
    historical: true,
  },
])(
  "compares context with metadata: $reason $percent% history=$historical",
  async ({ lower, reason, percent, tone, historical }) => {
    const i18n = await createResourceTestI18n(
      { "zh-CN": { aiApiVerification: zhCN } },
      "zh-CN",
    )
    render(
      <I18nextProvider i18n={i18n}>
        <ContextCapacityPanel
          controller={{
            enabled: true,
            running: false,
            canRun: true,
            progress: null,
            error: null,
            stopped: false,
            run: vi.fn(),
            stop: vi.fn(),
            result: historical
              ? null
              : {
                  lowerBoundTokens: lower,
                  upperBoundTokens: lower + 1024,
                  reason,
                  attempts: [],
                  counter: {
                    encoding: "o200k_base",
                    estimated: true,
                    declaredContext: 131072,
                  },
                },
            history: historical
              ? {
                  targetKey: "connection:fixture",
                  scopeKey: "fixture",
                  verifiedAt: 1,
                  apiType: "openai-compatible",
                  modelId: "model",
                  requests: 2,
                  outputLimited: false,
                  lowerBoundTokens: lower,
                  upperBoundTokens: lower + 1024,
                  declaredContext: 131072,
                  reason,
                }
              : null,
          }}
        />
      </I18nextProvider>,
    )
    const summary = screen.getByRole("status", { name: "上下文探测结果" })
    expect(summary).toHaveTextContent(
      lower === 130990 ? "已验证约 127.9K tokens" : "已验证约 64K tokens",
    )
    expect(screen.getByText(`上下文 ≈${percent}%`)).toBeVisible()
    expect(screen.getByText(`上下文 ≈${percent}%`)).toHaveClass(
      historical ? "bg-secondary" : tone,
    )
    if (historical) {
      const user = userEvent.setup()
      await user.click(screen.getByRole("button", { name: /^上次/ }))
      expect(await screen.findByRole("tooltip")).toHaveTextContent(
        "历史记录保留测量结果，未保存逐次请求明细。",
      )
      await user.keyboard("{Escape}")
    }
    expect(summary).toHaveTextContent("元数据声明 128K tokens")
    expect(summary).not.toHaveTextContent("%")
    expect(
      within(screen.getByRole("status", { name: "上下文探测结果" })).getByText(
        zhCN.verifyDialog.tools.context.reasons[reason],
      ),
    ).toBeVisible()
    expect(screen.getByText(zhCN.verifyDialog.tools.context.hint)).toBeVisible()
    expect(
      within(summary).queryByText(zhCN.verifyDialog.tools.context.hint),
    ).not.toBeInTheDocument()
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "测试详情" }))
    const details = screen.getByRole("region", { name: "测试详情" })
    expect(within(details).getByText("测量依据")).toBeVisible()
    expect(within(details).getByText("请求与用量")).toBeVisible()
    expect(
      within(details).getByText(
        `容量拒绝位置：${(lower + 1024).toLocaleString()} 个本地文本 token`,
      ),
    ).toBeVisible()
    expect(
      screen.getAllByText(zhCN.verifyDialog.tools.context.reasons[reason]),
    ).toHaveLength(1)
  },
)

it.each([
  {
    reason: CONTEXT_CAPACITY_REASONS.TestLimit,
    lower: 99000,
    upper: undefined,
    declared: 100000,
    tone: "bg-success-soft",
  },
  {
    reason: CONTEXT_CAPACITY_REASONS.Bracketed,
    lower: 99000,
    upper: 99500,
    declared: 100000,
    tone: "bg-success-soft",
  },
  {
    reason: CONTEXT_CAPACITY_REASONS.Bracketed,
    lower: 94000,
    upper: 94999,
    declared: 100000,
    tone: "bg-warning-soft",
  },
  {
    reason: CONTEXT_CAPACITY_REASONS.Bracketed,
    lower: 94000,
    upper: 95000,
    declared: 100000,
    tone: "bg-secondary",
  },
  {
    reason: CONTEXT_CAPACITY_REASONS.Bracketed,
    lower: 98000,
    upper: 98500,
    declared: 100000,
    tone: "bg-secondary",
  },
  {
    reason: CONTEXT_CAPACITY_REASONS.Bracketed,
    lower: 50000,
    upper: undefined,
    declared: 100000,
    tone: "bg-secondary",
  },
  {
    reason: CONTEXT_CAPACITY_REASONS.TestLimit,
    lower: 50000,
    upper: undefined,
    declared: 100000,
    tone: "bg-secondary",
  },
  {
    reason: CONTEXT_CAPACITY_REASONS.Budget,
    lower: 99900,
    upper: undefined,
    declared: 100000,
    tone: "bg-secondary",
  },
  {
    reason: CONTEXT_CAPACITY_REASONS.Inconclusive,
    lower: 99900,
    upper: undefined,
    declared: 100000,
    tone: "bg-secondary",
  },
  {
    reason: CONTEXT_CAPACITY_REASONS.Stopped,
    lower: 99900,
    upper: undefined,
    declared: 100000,
    tone: "bg-secondary",
  },
  {
    reason: CONTEXT_CAPACITY_REASONS.Error,
    lower: 99900,
    upper: undefined,
    declared: 100000,
    tone: "bg-secondary",
  },
  {
    reason: CONTEXT_CAPACITY_REASONS.TestLimit,
    lower: 99900,
    upper: undefined,
    declared: undefined,
    tone: "bg-secondary",
  },
] as const)(
  "colors accepted context from confirmed evidence: $reason lower=$lower upper=$upper declared=$declared",
  ({ reason, lower, upper, declared, tone }) => {
    render(
      <I18nextProvider i18n={testI18n}>
        <ContextCapacityPanel
          controller={{
            enabled: true,
            running: false,
            canRun: true,
            progress: null,
            error: reason === "error" ? "Request failed" : null,
            stopped: reason === "stopped",
            run: vi.fn(),
            stop: vi.fn(),
            result: {
              lowerBoundTokens: lower,
              upperBoundTokens: upper,
              reason: reason === "error" ? "test-limit" : reason,
              attempts: [],
              counter: {
                encoding: "o200k_base",
                estimated: true,
                declaredContext: declared,
              },
            },
          }}
        />
      </I18nextProvider>,
    )
    expect(
      screen.getByText(
        declared === undefined
          ? "aiApiVerification:verifyDialog.tools.context.measuredBadge"
          : "aiApiVerification:verifyDialog.tools.context.coverage",
      ),
    ).toHaveClass(tone)
    if (reason === "error")
      expect(
        screen.getByText("aiApiVerification:verifyDialog.status.fail"),
      ).toBeVisible()
  },
)

it.each([0, 32768])(
  "keeps running feedback compact at %i accepted tokens and allows stopping",
  async (lowerBoundTokens) => {
    const stop = vi.fn()
    render(
      <I18nextProvider i18n={testI18n}>
        <ContextCapacityPanel
          controller={{
            enabled: true,
            running: true,
            canRun: false,
            result: null,
            progress: {
              lowerBoundTokens,
              attempts: [],
              reason: CONTEXT_CAPACITY_REASONS.TestLimit,
            },
            error: null,
            stopped: false,
            run: vi.fn(),
            stop,
          }}
        />
      </I18nextProvider>,
    )
    expect(
      within(
        screen.getByRole("status", {
          name: "aiApiVerification:verifyDialog.tools.context.resultLabel",
        }),
      ).getByText(
        lowerBoundTokens > 0
          ? "aiApiVerification:verifyDialog.tools.context.acceptedTitle"
          : "aiApiVerification:verifyDialog.actions.running",
      ),
    ).toBeVisible()
    expect(
      screen.queryByText("aiApiVerification:verifyDialog.status.pending"),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText(
        "aiApiVerification:verifyDialog.tools.context.runningTitle",
      ),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText(
        "aiApiVerification:verifyDialog.tools.context.runningHint",
      ),
    ).not.toBeInTheDocument()
    if (lowerBoundTokens > 0) {
      expect(
        screen.getByText(
          "aiApiVerification:verifyDialog.tools.context.acceptedTitle",
        ),
      ).toBeVisible()
    }
    await userEvent.setup().click(
      screen.getByRole("button", {
        name: "aiApiVerification:verifyDialog.tools.stop",
      }),
    )
    expect(stop).toHaveBeenCalledOnce()
  },
)

it("restores the previous capacity after reopening without rerunning the model", async () => {
  vi.stubGlobal("crypto", webcrypto)
  await verificationResultHistoryStorage.clearAllData()
  const runner = vi.fn().mockResolvedValue({
    lowerBoundTokens: 131004,
    reason: CONTEXT_CAPACITY_REASONS.TestLimit,
    attempts: [
      {
        targetTokens: 131004,
        outcome: CONTEXT_ATTEMPT_OUTCOMES.Accepted,
        finishReason: "length",
      },
    ],
    counter: { encoding: "o200k_base", estimated: true },
  })
  function Fixture({ secret = "first" }: { secret?: string }) {
    return (
      <ContextCapacityPanel
        controller={useContextCapacity({
          enabled: true,
          blocked: false,
          contextKey: secret,
          historyAccess: contextCapacityHistory,
          runner,
          resolveRequest: async () => ({
            baseUrl: "https://history.invalid",
            apiKey: secret,
            apiType: "openai-compatible",
            modelId: "model",
            mode: "non-streaming",
            requestProfile: "default",
            requestProfileEnhanced: false,
            secrets: [secret],
          }),
        })}
      />
    )
  }
  try {
    const user = userEvent.setup()
    const first = render(
      <I18nextProvider i18n={testI18n}>
        <Fixture />
      </I18nextProvider>,
    )
    await user.click(
      screen.getByRole("button", {
        name: "aiApiVerification:verifyDialog.tools.context.run",
      }),
    )
    expect(
      await screen.findByText(
        "aiApiVerification:verifyDialog.tools.context.acceptedTitle",
      ),
    ).toBeVisible()
    await waitFor(async () =>
      expect(
        await contextCapacityHistory.get({
          baseUrl: "https://history.invalid",
          apiKey: "first",
          apiType: "openai-compatible",
          modelId: "model",
          mode: "non-streaming",
          requestProfile: "default",
          requestProfileEnhanced: false,
        }),
      ).not.toBeNull(),
    )
    first.unmount()
    const second = render(
      <I18nextProvider i18n={testI18n}>
        <Fixture />
      </I18nextProvider>,
    )
    expect(
      await screen.findByText(
        "aiApiVerification:verifyDialog.tools.context.acceptedTitle",
      ),
    ).toBeVisible()
    expect(runner).toHaveBeenCalledTimes(1)
    second.rerender(
      <I18nextProvider i18n={testI18n}>
        <Fixture secret="second" />
      </I18nextProvider>,
    )
    await waitFor(() =>
      expect(
        screen.queryByText(
          "aiApiVerification:verifyDialog.tools.context.acceptedTitle",
        ),
      ).not.toBeInTheDocument(),
    )
    second.unmount()
  } finally {
    vi.unstubAllGlobals()
    await verificationResultHistoryStorage.clearAllData()
  }
})

it("emphasizes accepted input while keeping technical usage collapsed", async () => {
  const controller = {
    enabled: true,
    running: false,
    canRun: true,
    progress: null,
    error: null,
    stopped: false,
    stop: vi.fn(),
    run: vi.fn(),
    result: {
      latencyMs: 3700,
      mode: "streaming" as const,
      reason: CONTEXT_CAPACITY_REASONS.TestLimit,
      lowerBoundTokens: 130990,
      attempts: [
        {
          outcome: CONTEXT_ATTEMPT_OUTCOMES.Accepted,
          targetTokens: 131004,
          inputTokens: 131004,
          outputTokens: 68,
          finishReason: "length",
        },
      ],
      counter: { encoding: "o200k_base", estimated: true },
    },
  }
  render(
    <I18nextProvider i18n={testI18n}>
      <ContextCapacityPanel controller={controller} />
    </I18nextProvider>,
  )
  expect(screen.getByText("3.7s")).toBeVisible()
  expect(
    screen.getByText("aiApiVerification:verifyDialog.modes.streaming"),
  ).toBeVisible()
  expect(
    screen.getByText("aiApiVerification:verifyDialog.status.pass"),
  ).toBeInTheDocument()
  expect(
    screen.queryByText("aiApiVerification:verifyDialog.tools.context.saved"),
  ).not.toBeInTheDocument()
  const notice = screen.getByRole("status", {
    name: "aiApiVerification:verifyDialog.tools.context.resultLabel",
  })
  expect(within(notice).queryByRole("heading")).not.toBeInTheDocument()
  expect(
    within(notice).getByText(
      "aiApiVerification:verifyDialog.tools.context.acceptedTitle",
    ),
  ).toBeVisible()
  expect(
    screen.queryByText(
      "aiApiVerification:verifyDialog.tools.context.outputLimited",
    ),
  ).not.toBeInTheDocument()
  expect(
    screen.queryByText(
      "aiApiVerification:verifyDialog.tools.context.reportedUsage",
    ),
  ).not.toBeInTheDocument()
  await userEvent.setup().click(
    screen.getByRole("button", {
      name: "aiApiVerification:verifyDialog.tools.context.details",
    }),
  )
  expect(screen.getByText("3.7s")).toBeVisible()
  expect(
    screen.getByText("aiApiVerification:verifyDialog.modes.streaming"),
  ).toBeVisible()
  expect(
    screen.getByText(
      "aiApiVerification:verifyDialog.tools.context.outputLimited",
    ),
  ).toBeVisible()
  expect(
    screen.getByText(
      "aiApiVerification:verifyDialog.tools.context.reportedUsage",
    ),
  ).toBeVisible()
})

it("continues a paused probe with its previous result", async () => {
  const user = userEvent.setup()
  const paused: ContextCapacityRunResult = {
    lowerBoundTokens: 4096,
    upperBoundTokens: 8192,
    reason: CONTEXT_CAPACITY_REASONS.Budget,
    attempts: [
      { targetTokens: 8192, outcome: CONTEXT_ATTEMPT_OUTCOMES.ContextLimit },
      { targetTokens: 4096, outcome: CONTEXT_ATTEMPT_OUTCOMES.Accepted },
    ],
    inputLimit: 8192,
    counter: { encoding: "o200k_base", estimated: true },
  }
  const runner = vi
    .fn()
    .mockResolvedValueOnce(paused)
    .mockResolvedValueOnce({
      ...paused,
      reason: CONTEXT_CAPACITY_REASONS.Bracketed,
    })
  function Fixture() {
    return (
      <ContextCapacityPanel
        controller={useContextCapacity({
          enabled: true,
          blocked: false,
          contextKey: "same",
          resolveRequest: async () => ({
            baseUrl: "https://example.invalid",
            apiKey: "secret",
            apiType: "openai-compatible",
            modelId: "model",
            mode: "non-streaming",
            requestProfile: "default",
            requestProfileEnhanced: false,
            secrets: [],
          }),
          runner,
        })}
      />
    )
  }
  render(
    <I18nextProvider i18n={testI18n}>
      <Fixture />
    </I18nextProvider>,
  )
  await user.click(
    screen.getByRole("button", {
      name: "aiApiVerification:verifyDialog.tools.context.run",
    }),
  )
  await user.click(
    await screen.findByRole("button", {
      name: "aiApiVerification:verifyDialog.tools.context.continue",
    }),
  )
  expect(runner.mock.calls[1]?.[0].resumeFrom).toEqual(paused)
})

it("offers an automatic probe without parameter settings and shares result details", async () => {
  const user = userEvent.setup()
  const controller = {
    enabled: true,
    running: false,
    canRun: true,
    result: null,
    progress: null,
    error: null,
    stopped: false,
    stop: vi.fn(),
    run: vi.fn(),
  }
  const view = render(
    <I18nextProvider i18n={testI18n}>
      <ContextCapacityPanel controller={controller} />
    </I18nextProvider>,
  )
  expect(
    screen.getByText("aiApiVerification:verifyDialog.status.pending"),
  ).toBeVisible()
  expect(
    screen.queryByText("aiApiVerification:verifyDialog.notRunYet"),
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole("status", {
      name: "aiApiVerification:verifyDialog.tools.context.resultLabel",
    }),
  ).not.toBeInTheDocument()
  expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument()
  expect(controller.run).not.toHaveBeenCalled()
  expect(
    screen.queryByRole("button", {
      name: "aiApiVerification:verifyDialog.tools.context.settings",
    }),
  ).not.toBeInTheDocument()
  expect(controller.run).not.toHaveBeenCalled()
  view.rerender(
    <I18nextProvider i18n={testI18n}>
      <ContextCapacityPanel
        controller={{
          ...controller,
          result: {
            lowerBoundTokens: 8192,
            reason: CONTEXT_CAPACITY_REASONS.TestLimit,
            attempts: [],
            counter: { encoding: "o200k_base", estimated: true },
          },
        }}
      />
    </I18nextProvider>,
  )
  await user.click(
    screen.getByRole("button", {
      name: "aiApiVerification:verifyDialog.tools.context.details",
    }),
  )
  const details = screen.getByRole("region", {
    name: "aiApiVerification:verifyDialog.tools.context.details",
  })
  expect(
    within(details).getByText(
      "aiApiVerification:verifyDialog.tools.context.lower",
    ),
  ).toBeVisible()
  await user.click(
    screen.getByRole("button", {
      name: "aiApiVerification:verifyDialog.tools.context.details",
    }),
  )
  expect(details).not.toBeInTheDocument()
})

it("keeps cancellation visible if support changes during a request", () => {
  const controller = {
    enabled: false,
    running: true,
    canRun: false,
    result: null,
    progress: null,
    error: null,
    stopped: false,
    stop: vi.fn(),
    run: vi.fn(),
  }
  render(
    <I18nextProvider i18n={testI18n}>
      <ContextCapacityPanel controller={controller} />
    </I18nextProvider>,
  )
  expect(
    screen.getByRole("button", {
      name: "aiApiVerification:verifyDialog.tools.stop",
    }),
  ).toBeVisible()
})

it("allows stopping a running capacity request without starting another", async () => {
  const user = userEvent.setup()
  let signal: AbortSignal | undefined
  const runner = vi.fn(async (params: RunContextCapacityParams) => {
    signal = params.abortSignal
    return await new Promise<never>((_, reject) =>
      params.abortSignal.addEventListener("abort", () =>
        reject(new DOMException("Stopped", "AbortError")),
      ),
    )
  })
  function Fixture() {
    const controller = useContextCapacity({
      enabled: true,
      blocked: false,
      contextKey: "one",
      resolveRequest: async () => ({
        baseUrl: "https://example.invalid",
        apiKey: "secret",
        apiType: "openai-compatible",
        modelId: "gpt-4o",
        mode: "non-streaming",
        requestProfile: "default",
        requestProfileEnhanced: false,
        secrets: ["secret"],
      }),
      runner,
    })
    return <ContextCapacityPanel controller={controller} />
  }
  render(
    <I18nextProvider i18n={testI18n}>
      <Fixture />
    </I18nextProvider>,
  )
  await user.click(
    screen.getByRole("button", {
      name: "aiApiVerification:verifyDialog.tools.context.run",
    }),
  )
  await user.click(
    await screen.findByRole("button", {
      name: "aiApiVerification:verifyDialog.tools.stop",
    }),
  )
  expect(signal?.aborted).toBe(true)
  expect(runner).toHaveBeenCalledTimes(1)
  expect(
    within(
      await screen.findByRole("status", {
        name: "aiApiVerification:verifyDialog.tools.context.resultLabel",
      }),
    ).getByText("aiApiVerification:verifyDialog.tools.context.stoppedTitle"),
  ).toBeVisible()
})

it("invalidates old context results when the model selection changes", async () => {
  const user = userEvent.setup()
  let finish: ((result: ContextCapacityRunResult) => void) | undefined
  let signal: AbortSignal | undefined
  const runner = async (params: RunContextCapacityParams) => {
    signal = params.abortSignal
    return await new Promise<ContextCapacityRunResult>((resolve) => {
      finish = resolve
    })
  }
  function Fixture({ contextKey }: { contextKey: string }) {
    const controller = useContextCapacity({
      enabled: true,
      blocked: false,
      contextKey,
      resolveRequest: async () => ({
        baseUrl: "https://example.invalid",
        apiKey: "secret",
        apiType: "openai-compatible",
        modelId: contextKey,
        mode: "non-streaming",
        requestProfile: "default",
        requestProfileEnhanced: false,
        secrets: ["secret"],
      }),
      runner,
    })
    return <ContextCapacityPanel controller={controller} />
  }
  const view = render(
    <I18nextProvider i18n={testI18n}>
      <Fixture contextKey="first" />
    </I18nextProvider>,
  )
  await user.click(
    screen.getByRole("button", {
      name: "aiApiVerification:verifyDialog.tools.context.run",
    }),
  )
  view.rerender(
    <I18nextProvider i18n={testI18n}>
      <Fixture contextKey="second" />
    </I18nextProvider>,
  )
  expect(signal?.aborted).toBe(true)
  await act(async () => {
    finish?.({
      lowerBoundTokens: 8192,
      reason: CONTEXT_CAPACITY_REASONS.TestLimit,
      attempts: [],
      counter: { encoding: "o200k_base", estimated: true },
    })
  })
  expect(
    screen.queryByText(
      "aiApiVerification:verifyDialog.tools.context.reasons.test-limit",
    ),
  ).not.toBeInTheDocument()
  expect(
    screen.getByRole("button", {
      name: "aiApiVerification:verifyDialog.tools.context.run",
    }),
  ).toBeEnabled()
})

it.each([
  [CONTEXT_CAPACITY_INCONCLUSIVE_REASONS.Timeout, "请求超时"],
  [CONTEXT_CAPACITY_INCONCLUSIVE_REASONS.EmptyResponse, "未返回正文"],
  [CONTEXT_CAPACITY_INCONCLUSIVE_REASONS.Interrupted, "未能确认"],
] as const)(
  "restores specific %s feedback",
  async (inconclusiveReason, label) => {
    const i18n = await createResourceTestI18n(
      { "zh-CN": { aiApiVerification: zhCN } },
      "zh-CN",
    )
    render(
      <I18nextProvider i18n={i18n}>
        <ContextCapacityPanel
          controller={{
            enabled: true,
            running: false,
            canRun: true,
            result: null,
            progress: null,
            error: null,
            stopped: false,
            run: vi.fn(),
            stop: vi.fn(),
            history: {
              targetKey: "fixture",
              scopeKey: "fixture",
              verifiedAt: 1,
              apiType: "openai-compatible",
              modelId: "model",
              lowerBoundTokens: 0,
              reason: "inconclusive",
              inconclusiveReason,
              requests: 1,
              outputLimited: false,
            },
          }}
        />
      </I18nextProvider>,
    )
    expect(
      screen.getByText(`上次${label}`).closest('[data-slot="badge"]'),
    ).toBeVisible()
    if (
      inconclusiveReason === CONTEXT_CAPACITY_INCONCLUSIVE_REASONS.Interrupted
    )
      expect(screen.getByText(/计费状态未知/)).toBeVisible()
  },
)

it.each([512, 1048576])(
  "renders the accepted capacity at %i tokens",
  async (lowerBoundTokens) => {
    const i18n = await createResourceTestI18n(
      { "zh-CN": { aiApiVerification: zhCN } },
      "zh-CN",
    )
    render(
      <I18nextProvider i18n={i18n}>
        <ContextCapacityPanel
          controller={{
            enabled: true,
            running: false,
            canRun: true,
            progress: null,
            error: null,
            stopped: false,
            run: vi.fn(),
            stop: vi.fn(),
            result: {
              lowerBoundTokens,
              reason: "test-limit",
              attempts: [],
              counter: { encoding: "o200k_base", estimated: false },
            },
          }}
        />
      </I18nextProvider>,
    )
    expect(
      screen.getByRole("status", { name: "上下文探测结果" }),
    ).toHaveTextContent(
      lowerBoundTokens === 512 ? "已验证约 512 tokens" : "已验证约 1M tokens",
    )
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "测试详情" }))
    expect(screen.getByText(/o200k_base/)).toBeVisible()
  },
)

it("warns about unknown charges before offering to discard interrupted tests", async () => {
  const discard = vi.fn()
  render(
    <I18nextProvider i18n={testI18n}>
      <ContextCapacityPanel
        controller={{
          enabled: true,
          running: false,
          canRun: false,
          result: null,
          progress: null,
          error: "limit",
          stopped: false,
          run: vi.fn(),
          stop: vi.fn(),
          checkpointLimitReached: true,
          discardingCheckpoints: false,
          discardCheckpoints: discard,
        }}
      />
    </I18nextProvider>,
  )
  expect(
    screen.getByText(
      "aiApiVerification:verifyDialog.tools.context.discardWarning",
    ),
  ).toBeVisible()
  await userEvent.setup().click(
    screen.getByRole("button", {
      name: "aiApiVerification:verifyDialog.tools.context.discard",
    }),
  )
  expect(discard).toHaveBeenCalledOnce()
})

it("shows the incomplete finish reason in context details", async () => {
  render(
    <I18nextProvider i18n={testI18n}>
      <ContextCapacityPanel
        controller={{
          enabled: true,
          running: false,
          canRun: true,
          result: {
            reason: "inconclusive",
            lowerBoundTokens: 0,
            counter: { encoding: "o200k_base", estimated: true },
            attempts: [
              {
                targetTokens: 1024,
                outcome: "inconclusive",
                finishReason: "content-filter",
              },
            ],
          },
          progress: null,
          error: null,
          stopped: false,
          run: vi.fn(),
          stop: vi.fn(),
        }}
      />
    </I18nextProvider>,
  )
  await userEvent.setup().click(
    screen.getByRole("button", {
      name: "aiApiVerification:verifyDialog.tools.context.details",
    }),
  )
  expect(
    screen.getByText(
      "aiApiVerification:verifyDialog.tools.context.incompleteResponse",
    ),
  ).toBeVisible()
})

it("labels masked-key history as a saved measurement rather than current credential verification", () => {
  render(
    <I18nextProvider i18n={testI18n}>
      <ContextCapacityPanel
        controller={{
          enabled: true,
          running: false,
          canRun: true,
          result: null,
          progress: null,
          error: null,
          stopped: false,
          run: vi.fn(),
          stop: vi.fn(),
          history: {
            targetKey: "fixture",
            scopeKey: "fixture",
            verifiedAt: 1,
            apiType: "openai",
            modelId: "model",
            reason: "test-limit",
            requests: 1,
            lowerBoundTokens: 4096,
            outputLimited: false,
            requiresCredentialVerification: true,
          },
        }}
      />
    </I18nextProvider>,
  )
  expect(
    screen.getByText(
      "aiApiVerification:verifyDialog.tools.context.maskedHistoryHint",
    ),
  ).toBeVisible()
  expect(
    screen.queryByText("aiApiVerification:verifyDialog.status.pass"),
  ).not.toBeInTheDocument()
})
