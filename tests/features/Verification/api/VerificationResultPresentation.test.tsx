import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { I18nextProvider } from "react-i18next"
import { expect, it, vi } from "vitest"

import { ContextCapacityPanel } from "~/features/Verification/api/ContextCapacityPanel"
import { NeedleResultView } from "~/features/Verification/api/NeedleResultView"
import { VerificationTestSection } from "~/features/Verification/api/VerificationLayout"
import { VerificationProbeDetails } from "~/features/Verification/api/VerificationProbeDetails"
import { VerificationProbeRow } from "~/features/Verification/api/VerificationProbeRow"
import { VerificationSettingsCard } from "~/features/Verification/api/VerificationSettingsCard"
import en from "~/locales/en/aiApiVerification.json"
import { CONTEXT_CAPACITY_REASONS } from "~/services/verification/modelQuality/contextCapacityConstants"
import { CONTEXT_TOKEN_ENCODINGS } from "~/services/verification/modelQuality/contextTokenConstants"
import {
  NEEDLE_OUTCOMES,
  NEEDLE_RUN_REASONS,
} from "~/services/verification/modelQuality/needleConstants"
import { createNeedlePlan } from "~/services/verification/modelQuality/needlePlan"
import type { NeedleResult } from "~/services/verification/modelQuality/needleRun"
import { createResourceTestI18n } from "~~/tests/test-utils/i18n"
import { createNeedleResult } from "~~/tests/test-utils/needle"

it.each(["Test settings", "Request configuration"])(
  "restores the last manual state of %s when a run ends",
  async (title) => {
    const user = userEvent.setup()
    const i18n = await createResourceTestI18n({ en: { aiApiVerification: en } })
    const panel = (running: boolean) => (
      <I18nextProvider i18n={i18n}>
        <VerificationSettingsCard title={title} running={running}>
          <input aria-label="Retained draft" defaultValue="Keep me" />
        </VerificationSettingsCard>
      </I18nextProvider>
    )
    const view = render(panel(false))
    const toggle = screen.getByRole("button", { name: title })
    view.rerender(panel(true))
    expect(toggle).toHaveAttribute("aria-expanded", "false")
    view.rerender(panel(false))
    expect(toggle).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByRole("textbox")).toHaveValue("Keep me")

    await user.click(toggle)
    view.rerender(panel(true))
    view.rerender(panel(false))
    expect(toggle).toHaveAttribute("aria-expanded", "false")

    await user.click(toggle)
    view.rerender(panel(true))
    await user.click(toggle)
    await user.click(toggle)
    view.rerender(panel(false))
    expect(toggle).toHaveAttribute("aria-expanded", "false")
  },
)

it("folds settings when a run starts and preserves edits and manual disclosure choices", async () => {
  const user = userEvent.setup()
  const i18n = await createResourceTestI18n({ en: { aiApiVerification: en } })
  const panel = (running: boolean) => (
    <I18nextProvider i18n={i18n}>
      <VerificationSettingsCard running={running}>
        <input aria-label="Question draft" defaultValue="Keep this draft" />
      </VerificationSettingsCard>
    </I18nextProvider>
  )
  const view = render(panel(false))
  const field = screen.getByRole("textbox", { name: "Question draft" })
  await user.type(field, " edited")
  view.rerender(panel(true))
  const toggle = screen.getByRole("button", { name: "Test settings" })
  expect(toggle).toHaveAttribute("aria-expanded", "false")
  expect(field).not.toBeVisible()
  await user.click(toggle)
  view.rerender(panel(true))
  expect(field).toBeVisible()
  expect(field).toHaveValue("Keep this draft edited")
  view.rerender(panel(false))
  expect(field).toBeVisible()
  await user.click(toggle)
  expect(field).not.toBeVisible()
  view.rerender(panel(false))
  expect(toggle).toHaveAttribute("aria-expanded", "false")
})

it("uses the pass badge as the text-generation conclusion when an answer is available", async () => {
  const i18n = await createResourceTestI18n({ en: { aiApiVerification: en } })
  render(
    <I18nextProvider i18n={i18n}>
      <VerificationProbeRow
        probeId="text-generation"
        result={{
          id: "text-generation",
          status: "pass",
          latencyMs: 5800,
          summaryKey: "verifyDialog.summaries.textGenerationSucceeded",
          summary: "Text generated successfully.",
          output: { text: "OK" },
        }}
        runButtonProps={{ children: "Run" }}
      />
    </I18nextProvider>,
  )
  expect(screen.getByText("OK")).toBeVisible()
  expect(screen.getByText(/Pass/)).toBeVisible()
  expect(
    screen.queryByText("Text generated successfully."),
  ).not.toBeInTheDocument()
})

it("shows restored metrics even when history has no raw response", async () => {
  const i18n = await createResourceTestI18n({ en: { aiApiVerification: en } })
  render(
    <I18nextProvider i18n={i18n}>
      <VerificationProbeDetails
        result={{
          summary: "Saved result",
          metrics: [
            {
              responseTimeMs: 1000,
              timeToFirstOutputMs: 100,
              outputTokens: 10,
            },
          ],
        }}
      />
    </I18nextProvider>,
  )
  expect(screen.getByText("First output")).toBeVisible()
  expect(screen.getByText("100ms")).toBeVisible()
})

it("keeps a partial response visible alongside failure diagnostics", async () => {
  const i18n = await createResourceTestI18n({ en: { aiApiVerification: en } })
  render(
    <I18nextProvider i18n={i18n}>
      <VerificationProbeRow
        probeId="text-generation"
        result={{
          id: "text-generation",
          status: "fail",
          latencyMs: 40,
          summary: "Connection lost",
          output: { httpStatus: 502 },
        }}
        progress={{
          text: "Partial response",
          reasoning: "",
          tools: [],
          step: 1,
        }}
        runButtonProps={{ children: "Retry" }}
      />
    </I18nextProvider>,
  )
  expect(screen.getByText("Partial response")).toBeVisible()
  expect(screen.getByText("Connection lost")).toBeVisible()
  expect(screen.getByText(en.verifyDialog.generation.partial)).toBeVisible()
})

it("keeps the result open and switches request details without hiding the conclusion", async () => {
  const user = userEvent.setup()
  const i18n = await createResourceTestI18n({ en: { aiApiVerification: en } })
  render(
    <I18nextProvider i18n={i18n}>
      <VerificationTestSection
        tools={null}
        configuration={<input aria-label="Connection" />}
      >
        <VerificationProbeDetails
          label="Text generation"
          heading={<span>Text generation</span>}
          status={<span>Pass</span>}
          result={{
            summary: "Received a text reply",
            output: "Hello",
            input: { prompt: "Hi" },
          }}
        >
          <VerificationSettingsCard>
            <input aria-label="Prompt" />
          </VerificationSettingsCard>
        </VerificationProbeDetails>
      </VerificationTestSection>
    </I18nextProvider>,
  )
  await user.click(screen.getByRole("button", { name: "Text generation" }))
  const result = screen.getByRole("region", {
    name: "Execution result",
  })
  expect(screen.getByText("Received a text reply")).toBeVisible()
  expect(within(result).queryByText("Pass")).not.toBeInTheDocument()
  expect(
    within(screen.getByRole("group", { name: "Text generation" })).getByText(
      "Pass",
    ),
  ).toBeVisible()
  expect(
    result.compareDocumentPosition(
      screen.getByRole("group", { name: "Test settings" }),
    ) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy()
  expect(
    within(result).queryByRole("button", { name: "Execution result" }),
  ).not.toBeInTheDocument()
  expect(within(result).getByText("Hello")).toBeVisible()
  await user.click(screen.getByRole("button", { name: "Request details" }))
  expect(screen.getByText("Received a text reply")).toBeVisible()
  expect(within(result).getByText(/"prompt": "Hi"/)).toBeVisible()
  await user.click(screen.getByRole("button", { name: "Request details" }))
  expect(within(result).getByText("Hello")).toBeVisible()
})

it("keeps a context budget pause and its measured lower bound inside the result card", async () => {
  const i18n = await createResourceTestI18n({ en: { aiApiVerification: en } })
  render(
    <I18nextProvider i18n={i18n}>
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
            lowerBoundTokens: 8192,
            attempts: [],
            counter: {
              encoding: CONTEXT_TOKEN_ENCODINGS.O200k,
              estimated: true,
            },
          },
        }}
      />
    </I18nextProvider>,
  )
  const result = screen.getByRole("region", {
    name: "Execution result",
  })
  expect(within(result).getByRole("status")).toHaveTextContent("8K")
  expect(within(result).getByRole("status")).toHaveTextContent(
    en.verifyDialog.tools.context.reasons.budget,
  )
  expect(
    screen.getByRole("button", {
      name: en.verifyDialog.tools.context.continue,
    }),
  ).toBeEnabled()
})

it("shows the needle matrix directly in the workspace without another result disclosure", async () => {
  const user = userEvent.setup()
  const i18n = await createResourceTestI18n({ en: { aiApiVerification: en } })
  const result = createNeedleResult({
    plan: createNeedlePlan({
      counter: { encoding: CONTEXT_TOKEN_ENCODINGS.O200k, estimated: true },
      maxInputTokens: 16384,
    }),
  })
  render(
    <I18nextProvider i18n={i18n}>
      <VerificationTestSection tools={null}>
        <VerificationProbeDetails label="Needle" heading="Needle">
          <NeedleResultView
            result={result}
            historical={false}
            running={false}
            hits={0}
            graded={0}
            matrixPlan={result.plan}
            onRun={vi.fn()}
            canRun
            plannedCells={[]}
          />
        </VerificationProbeDetails>
      </VerificationTestSection>
    </I18nextProvider>,
  )
  await user.click(screen.getByRole("button", { name: "Needle" }))
  const evidence = screen.getByRole("region", { name: "Execution result" })
  expect(within(evidence).getByRole("table")).toBeVisible()
  expect(
    within(evidence).queryByRole("button", { name: "Execution result" }),
  ).not.toBeInTheDocument()
  expect(
    within(evidence).getByText("No gradable result was obtained."),
  ).toBeVisible()
  expect(within(evidence).queryByText(/0\/0/)).not.toBeInTheDocument()
  expect(
    within(evidence).getByText("Cumulative results: 0/6 combinations matched"),
  ).toBeVisible()
})

it.each([
  { scheduled: 6, reason: NEEDLE_RUN_REASONS.Complete },
  { scheduled: 2, reason: NEEDLE_RUN_REASONS.Complete },
  { scheduled: 2, reason: NEEDLE_RUN_REASONS.Stopped },
])(
  "keeps one needle score in the toolbar for $reason and $scheduled latest requests",
  async ({ scheduled, reason }) => {
    const user = userEvent.setup()
    const i18n = await createResourceTestI18n({ en: { aiApiVerification: en } })
    const counter = {
      encoding: CONTEXT_TOKEN_ENCODINGS.O200k,
      estimated: true,
    } as const
    const plan = createNeedlePlan({ counter, maxInputTokens: 16384 })
    const coordinates = plan.lengths.flatMap((targetTokens) =>
      plan.depths.map((depth) => ({ targetTokens, depth })),
    )
    const result = createNeedleResult({
      plan,
      reason,
      processed: scheduled,
      scheduled: coordinates.slice(0, scheduled),
    })
    render(
      <I18nextProvider i18n={i18n}>
        <VerificationTestSection
          tools={null}
          configuration={<input aria-label="Connection" />}
        >
          <VerificationProbeDetails
            label="Needle"
            heading="Needle"
            status={
              <span>
                {reason === NEEDLE_RUN_REASONS.Complete
                  ? "Previously: 6/6 matched"
                  : "Stopped"}
              </span>
            }
          >
            <NeedleResultView
              result={result}
              historical
              running={false}
              hits={6}
              graded={6}
              matrixPlan={plan}
              onRun={vi.fn()}
              canRun
              plannedCells={[]}
            />
          </VerificationProbeDetails>
        </VerificationTestSection>
      </I18nextProvider>,
    )
    await user.click(screen.getByRole("button", { name: "Needle" }))
    const header = screen.getByRole("group", { name: "Needle" })
    expect(
      within(header).getByText(
        reason === NEEDLE_RUN_REASONS.Complete
          ? "Previously: 6/6 matched"
          : "6/6 matched",
      ),
    ).toBeVisible()
    expect(
      within(header).queryByText(/Cumulative results:/),
    ).not.toBeInTheDocument()
    expect(
      within(header).queryByText(en.verifyDialog.tools.needle.savedResult),
    ).not.toBeInTheDocument()
    if (scheduled < 6)
      expect(within(header).getByText("Processed 2/2")).toBeVisible()
    else expect(within(header).queryByText(/Processed/)).not.toBeInTheDocument()
    expect(screen.getByRole("table")).toBeVisible()
  },
)

it("opens the needle matrix for a new run without reopening it on every progress update", async () => {
  const user = userEvent.setup()
  const i18n = await createResourceTestI18n({ en: { aiApiVerification: en } })
  const counter = {
    encoding: CONTEXT_TOKEN_ENCODINGS.O200k,
    estimated: true,
  } as const
  const plan = createNeedlePlan({ counter, maxInputTokens: 8192 })
  const renderResult = (running: boolean, processed: number) => (
    <I18nextProvider i18n={i18n}>
      <NeedleResultView
        result={createNeedleResult({
          seed: 12,
          counter,
          plan,
          reason: running
            ? NEEDLE_RUN_REASONS.Running
            : NEEDLE_RUN_REASONS.Complete,
          processed,
          cells: [],
        })}
        historical={false}
        running={running}
        hits={0}
        graded={0}
        matrixPlan={plan}
        onRun={vi.fn()}
        canRun={!running}
        plannedCells={[{ targetTokens: 8192, depth: 10 }]}
      />
    </I18nextProvider>
  )
  const view = render(renderResult(false, 1))
  const toggle = screen.getByRole("button", { name: "Execution result" })
  await user.click(toggle)
  expect(screen.queryByRole("table")).not.toBeInTheDocument()
  view.rerender(renderResult(true, 0))
  expect(screen.getByRole("table")).toBeVisible()
  await user.click(toggle)
  view.rerender(renderResult(true, 1))
  expect(screen.queryByRole("table")).not.toBeInTheDocument()
  expect(screen.getByText("Latest run: Processed 1/1 requests")).toBeVisible()
  view.rerender(renderResult(false, 1))
  expect(screen.queryByRole("table")).not.toBeInTheDocument()
})

it("separates cumulative matches from the latest run and keeps cancelled request evidence optional", async () => {
  const user = userEvent.setup()
  const i18n = await createResourceTestI18n({ en: { aiApiVerification: en } })
  const counter = {
    encoding: CONTEXT_TOKEN_ENCODINGS.O200k,
    estimated: true,
  } as const
  const plan = createNeedlePlan({ counter, maxInputTokens: 16384 })
  const result: NeedleResult = createNeedleResult({
    seed: 12,
    counter,
    plan,
    reason: NEEDLE_RUN_REASONS.Stopped,
    processed: 2,
    scheduled: [
      { targetTokens: 8192, depth: 10 },
      { targetTokens: 16384, depth: 10 },
    ],
    cancelled: [
      { targetTokens: 8192, depth: 10 },
      { targetTokens: 16384, depth: 10 },
    ],
    cells: [
      ...[8192, 16384].flatMap((targetTokens) =>
        [50, 90].map((depth) => ({
          targetTokens,
          depth,
          actualDepth: depth,
          localInputTokens: targetTokens - 24,
          outcome: NEEDLE_OUTCOMES.Hit,
        })),
      ),
      {
        targetTokens: 16384,
        depth: 10,
        actualDepth: 10,
        localInputTokens: 16360,
        outcome: NEEDLE_OUTCOMES.Interrupted,
        latencyMs: 1563,
        expected: "sample-answer",
      },
    ],
  })
  render(
    <I18nextProvider i18n={i18n}>
      <NeedleResultView
        result={result}
        historical={false}
        running={false}
        hits={4}
        graded={4}
        matrixPlan={plan}
        onRun={vi.fn()}
        canRun
        plannedCells={result.scheduled!}
      />
    </I18nextProvider>,
  )
  const card = screen.getByRole("region", {
    name: "Execution result",
  })
  expect(
    within(card).getByText("Cumulative results: 4/6 combinations matched"),
  ).toBeVisible()
  expect(
    within(card).getByText("Latest run: Processed 2/2 requests"),
  ).toBeVisible()
  await user.click(
    within(card).getByRole("button", { name: "16384 tokens · 10%: Cancelled" }),
  )
  const details = within(card).getByRole("region", { name: "Cell details" })
  expect(
    within(details).getByText("No gradable result was obtained."),
  ).toBeVisible()
  expect(within(details).queryByText(/sample-answer/)).not.toBeInTheDocument()
  await user.click(
    within(details).getByRole("button", { name: "Request and answer details" }),
  )
  expect(within(details).getByText("Expected: sample-answer")).toBeVisible()
  expect(
    within(card).getByRole("button", {
      name: "Test parameters and reproduction",
    }),
  ).toBeVisible()
  const toggle = within(card).getByRole("button", { name: "Execution result" })
  await user.click(toggle)
  expect(toggle).toHaveAttribute("aria-expanded", "false")
  expect(within(card).queryByRole("table")).not.toBeInTheDocument()
  expect(details).not.toBeVisible()
  expect(
    within(card).getByText("Cumulative results: 4/6 combinations matched"),
  ).toBeVisible()
  expect(
    within(card).getByText("Latest run: Processed 2/2 requests"),
  ).toBeVisible()
  await user.click(toggle)
  expect(toggle).toHaveAttribute("aria-expanded", "true")
  expect(
    within(card).getByRole("button", { name: "16384 tokens · 10%: Cancelled" }),
  ).toHaveAttribute("aria-pressed", "true")
  expect(within(details).getByText("Expected: sample-answer")).toBeVisible()
})
