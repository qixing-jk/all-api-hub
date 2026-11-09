import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { I18nextProvider } from "react-i18next"
import { expect, it, vi } from "vitest"

import { ContextCapacityPanel } from "~/features/Verification/api/ContextCapacityPanel"
import { NeedleResultView } from "~/features/Verification/api/NeedleResultView"
import { VerificationTestSection } from "~/features/Verification/api/VerificationLayout"
import { VerificationProbeDetails } from "~/features/Verification/api/VerificationProbeDetails"
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

it("keeps the conclusion visible above settings when the response is collapsed", async () => {
  const user = userEvent.setup()
  const i18n = await createResourceTestI18n({ en: { aiApiVerification: en } })
  render(
    <I18nextProvider i18n={i18n}>
      <VerificationTestSection tools={null}>
        <VerificationProbeDetails
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
  const result = screen.getByRole("region", {
    name: "Execution result",
  })
  expect(within(result).getByText("Received a text reply")).toBeVisible()
  expect(within(result).getByText("Pass")).toBeVisible()
  expect(
    result.compareDocumentPosition(
      screen.getByRole("group", { name: "Test settings" }),
    ) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy()
  await user.click(
    within(result).getByRole("button", { name: "Execution result" }),
  )
  expect(within(result).getByText("Received a text reply")).toBeVisible()
  expect(within(result).queryByText("Hello")).not.toBeInTheDocument()
  await user.click(
    within(result).getByRole("button", { name: "Execution result" }),
  )
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
    within(card).getByText("Cumulative results: 4/4 graded answers matched"),
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
    within(card).getByText("Cumulative results: 4/4 graded answers matched"),
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
