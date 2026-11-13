import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ComponentProps } from "react"
import { I18nextProvider } from "react-i18next"
import { expect, it } from "vitest"

import { VerificationGenerationOutput } from "~/features/Verification/api/VerificationGenerationOutput"
import en from "~/locales/en/aiApiVerification.json"
import {
  VERIFICATION_GENERATION_PART_TYPES,
  VERIFICATION_GENERATION_TOOL_STATES,
} from "~/services/verification/aiApiVerification/generationProgress"
import { createResourceTestI18n } from "~~/tests/test-utils/i18n"

it("labels actual response text and places current activity after the process", async () => {
  const i18n = await createResourceTestI18n({ en: { aiApiVerification: en } })
  const output = (answer: boolean) => (
    <I18nextProvider i18n={i18n}>
      <VerificationGenerationOutput
        running
        progress={{
          text: answer ? "Hello" : "",
          reasoning: "Considering",
          tools: [],
          step: 1,
          parts: [
            {
              id: "0",
              step: 1,
              type: VERIFICATION_GENERATION_PART_TYPES.Reasoning,
              text: "Considering",
            },
            ...(answer
              ? [
                  {
                    id: "1",
                    step: 1,
                    type: VERIFICATION_GENERATION_PART_TYPES.Text,
                    text: "Hello",
                  },
                ]
              : []),
          ],
        }}
      />
    </I18nextProvider>
  )
  const view = render(output(false))
  expect(screen.getByRole("status")).toHaveTextContent("Thinking")
  expect(screen.getByRole("button", { name: "Reasoning" })).toHaveAttribute(
    "aria-expanded",
    "true",
  )
  expect(screen.queryByText("Model response")).not.toBeInTheDocument()
  view.rerender(output(true))
  expect(screen.getByRole("button", { name: "Reasoning" })).toHaveAttribute(
    "aria-expanded",
    "false",
  )
  const answer = screen.getByRole("region", { name: "Model response" })
  expect(within(answer).getByText("Hello")).toBeVisible()
  expect(screen.getByRole("status")).toHaveTextContent("Writing response")
  expect(
    answer.compareDocumentPosition(screen.getByRole("status")) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy()
})

it("opens active reasoning and preserves the reader's choice through updates and completion", async () => {
  const user = userEvent.setup()
  const i18n = await createResourceTestI18n({ en: { aiApiVerification: en } })
  const output = (text: string, running = true) => (
    <I18nextProvider i18n={i18n}>
      <VerificationGenerationOutput
        running={running}
        progress={{
          text: "",
          reasoning: text,
          tools: [],
          step: 1,
          parts: [
            {
              id: "0",
              step: 1,
              type: VERIFICATION_GENERATION_PART_TYPES.Reasoning,
              text,
            },
          ],
        }}
      />
    </I18nextProvider>
  )
  const view = render(output("Latest observation"))
  const trigger = screen.getByRole("button", { name: "Reasoning" })
  expect(trigger).toHaveAttribute("aria-expanded", "true")
  await user.click(trigger)
  expect(trigger).toHaveAttribute("aria-expanded", "false")
  expect(screen.getByText("Latest observation")).toBeVisible()
  view.rerender(output("New observation"))
  expect(trigger).toHaveAttribute("aria-expanded", "false")
  expect(screen.getByText("New observation")).toBeVisible()
  await user.click(trigger)
  view.rerender(output("Complete reasoning", false))
  expect(trigger).toHaveAttribute("aria-expanded", "true")
  expect(screen.getByText("Complete reasoning")).toBeVisible()
  await user.click(screen.getByRole("button", { name: "Collapse reasoning" }))
  expect(trigger).toHaveAttribute("aria-expanded", "false")
  expect(trigger).toHaveFocus()
  expect(screen.getByText("Complete reasoning")).toBeVisible()
})

it("keeps stopped output without presenting it as a final answer or a completed tool", async () => {
  const i18n = await createResourceTestI18n({ en: { aiApiVerification: en } })
  render(
    <I18nextProvider i18n={i18n}>
      <VerificationGenerationOutput
        partial
        progress={{
          text: "Partial answer",
          reasoning: "",
          tools: [],
          step: 1,
          parts: [
            {
              id: "0",
              step: 1,
              type: VERIFICATION_GENERATION_PART_TYPES.Text,
              text: "Partial answer",
            },
            {
              id: "1",
              step: 1,
              type: VERIFICATION_GENERATION_PART_TYPES.Tool,
              toolCallId: "a",
              name: "lookup",
              input: "{}",
              state: VERIFICATION_GENERATION_TOOL_STATES.InputAvailable,
            },
          ],
        }}
      />
    </I18nextProvider>,
  )
  expect(screen.getByText("Partial answer")).toBeVisible()
  expect(screen.getByText("No result received")).toBeVisible()
  expect(
    screen.queryByRole("button", { name: "Jump to final answer" }),
  ).not.toBeInTheDocument()
  expect(screen.queryByText("Completed")).not.toBeInTheDocument()
})

it("shows interleaved process blocks in order and keeps inspected reasoning open as output arrives", async () => {
  const user = userEvent.setup()
  const i18n = await createResourceTestI18n({ en: { aiApiVerification: en } })
  const output = (running: boolean) => (
    <I18nextProvider i18n={i18n}>
      <VerificationGenerationOutput
        running={running}
        progress={{
          text: "Checking\n\nDone",
          reasoning: "Plan\n\nReview",
          tools: [],
          step: 2,
          parts: [
            {
              id: "0",
              step: 1,
              type: VERIFICATION_GENERATION_PART_TYPES.Reasoning,
              text: "Plan",
            },
            {
              id: "1",
              step: 1,
              type: VERIFICATION_GENERATION_PART_TYPES.Text,
              text: "Checking",
            },
            {
              id: "2",
              step: 1,
              type: VERIFICATION_GENERATION_PART_TYPES.Tool,
              toolCallId: "call",
              name: "lookup",
              input: "{}",
              output: "false",
              state: VERIFICATION_GENERATION_TOOL_STATES.OutputAvailable,
            },
            {
              id: "3",
              step: 2,
              type: VERIFICATION_GENERATION_PART_TYPES.Reasoning,
              text: "Review",
            },
            {
              id: "4",
              step: 2,
              type: VERIFICATION_GENERATION_PART_TYPES.Text,
              text: running ? "Do" : "Done",
            },
          ],
        }}
      />
    </I18nextProvider>
  )
  const view = render(output(true))
  expect(screen.queryByRole("tab")).not.toBeInTheDocument()
  const process = screen.getByRole("log")
  const items = within(process).getAllByRole("listitem")
  expect(items).toHaveLength(5)
  expect(items[0]).toHaveTextContent("Reasoning")
  expect(items[1]).toHaveTextContent("Checking")
  expect(items[2]).toHaveTextContent("lookup")
  expect(items[3]).toHaveTextContent("Reasoning")
  expect(items[4]).toHaveTextContent("Do")
  await user.click(within(items[0]!).getByRole("button"))
  expect(screen.getByText("Plan")).toBeVisible()
  await user.click(within(items[2]!).getByRole("button"))
  expect(screen.getByText("false")).toBeVisible()
  view.rerender(output(false))
  expect(screen.getByText("Plan")).toBeVisible()
  expect(screen.getByText("Done")).toBeVisible()
  expect(screen.queryByText("Checking Done")).not.toBeInTheDocument()
})

it("keeps the answer visible while users inspect reasoning and complete statistics", async () => {
  const user = userEvent.setup()
  const i18n = await createResourceTestI18n({ en: { aiApiVerification: en } })
  render(
    <I18nextProvider i18n={i18n}>
      <VerificationGenerationOutput
        progress={{
          text: "OK",
          reasoning: "Reasoning sample",
          tools: [],
          step: 1,
          parts: [
            {
              id: "0",
              step: 1,
              type: VERIFICATION_GENERATION_PART_TYPES.Reasoning,
              text: "Reasoning sample",
            },
            {
              id: "1",
              step: 1,
              type: VERIFICATION_GENERATION_PART_TYPES.Text,
              text: "OK",
            },
          ],
        }}
        metrics={[
          {
            responseTimeMs: 5800,
            timeToFirstOutputMs: 3300,
            outputTokensPerSecond: 58.6,
            effectiveOutputTokensPerSecond: 25.8,
            inputTokens: 18,
            outputTokens: 151,
            reasoningTokens: 155,
            cachedInputTokens: 0,
          },
        ]}
      />
    </I18nextProvider>,
  )
  expect(screen.getByText("OK")).toBeVisible()
  expect(
    screen.queryByRole("button", { name: "Jump to final answer" }),
  ).not.toBeInTheDocument()
  expect(screen.getByText("Reasoning sample")).toBeVisible()
  expect(screen.queryByText("Input tokens")).not.toBeInTheDocument()
  expect(screen.getByText("58.6 token/s")).toBeVisible()
  await user.click(screen.getByRole("button", { name: "Reasoning" }))
  expect(screen.getByText("Reasoning sample")).toBeVisible()
  expect(screen.getByText("OK")).toBeVisible()
  await user.click(screen.getByRole("button", { name: "Statistics" }))
  expect(screen.getByRole("dialog", { name: "Statistics" })).toBeVisible()
  expect(screen.getByText("155")).toBeVisible()
  expect(screen.getByText("0")).toBeVisible()
  expect(screen.getByText("25.8 token/s")).toBeVisible()
  await user.click(
    screen.getByRole("button", {
      name: en.verifyDialog.generation.metricsHelp,
    }),
  )
  expect(await screen.findByRole("tooltip")).toHaveTextContent(
    en.verifyDialog.generation.metricsHint,
  )
  await user.keyboard("{Escape}")
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument()
  expect(screen.getByRole("dialog", { name: "Statistics" })).toBeVisible()
  await user.keyboard("{Escape}")
  expect(
    screen.queryByRole("dialog", { name: "Statistics" }),
  ).not.toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Statistics" })).toHaveFocus()
  expect(screen.getByText("OK")).toBeVisible()
})

it("keeps a reasoning disclosure keyboard-accessible across streaming updates", async () => {
  const user = userEvent.setup()
  const i18n = await createResourceTestI18n({ en: { aiApiVerification: en } })
  const output = (
    props: ComponentProps<typeof VerificationGenerationOutput>,
  ) => (
    <I18nextProvider i18n={i18n}>
      <VerificationGenerationOutput {...props} />
    </I18nextProvider>
  )
  const progress = {
    text: "",
    reasoning: "First thought",
    tools: [],
    step: 1,
    parts: [
      {
        id: "0",
        step: 1,
        type: VERIFICATION_GENERATION_PART_TYPES.Reasoning,
        text: "First thought",
      },
    ],
  }
  const view = render(output({ running: true, progress }))
  const trigger = screen.getByRole("button", { name: "Reasoning" })
  trigger.focus()
  await user.keyboard("{Enter}")
  await user.keyboard("{Enter}")
  view.rerender(
    output({
      running: true,
      progress: {
        ...progress,
        parts: [{ ...progress.parts[0]!, text: "More thoughts" }],
      },
    }),
  )
  expect(screen.getByRole("button", { name: "Reasoning" })).toHaveAttribute(
    "aria-expanded",
    "true",
  )
  expect(screen.getByText("More thoughts")).toBeVisible()
  view.rerender(
    output({
      progress: {
        ...progress,
        text: "Final answer",
        reasoning: "More thoughts",
        parts: [
          { ...progress.parts[0]!, text: "More thoughts" },
          {
            id: "1",
            step: 1,
            type: VERIFICATION_GENERATION_PART_TYPES.Text,
            text: "Final answer",
          },
        ],
      },
      metrics: [{ inputTokens: 18 }],
    }),
  )
  expect(screen.getByRole("button", { name: "Reasoning" })).toHaveAttribute(
    "aria-expanded",
    "true",
  )
  expect(trigger).toHaveFocus()
  await user.keyboard("{Enter}")
  expect(trigger).toHaveAttribute("aria-expanded", "false")
  expect(screen.getByText("Final answer")).toBeVisible()
})

it("shows tool-only output and metrics-only history without an empty answer or invented values", async () => {
  const user = userEvent.setup()
  const i18n = await createResourceTestI18n({ en: { aiApiVerification: en } })
  render(
    <I18nextProvider i18n={i18n}>
      <VerificationGenerationOutput
        progress={{
          text: "",
          reasoning: "",
          tools: [{ id: "call-1", name: "get_time", input: "{}" }],
          step: 2,
          parts: [
            {
              id: "0",
              step: 2,
              type: VERIFICATION_GENERATION_PART_TYPES.Tool,
              toolCallId: "call-1",
              name: "get_time",
              input: "{}",
              state: VERIFICATION_GENERATION_TOOL_STATES.InputAvailable,
            },
          ],
        }}
        metrics={[{ inputTokens: 18 }, { outputTokens: 0 }]}
      />
    </I18nextProvider>,
  )
  expect(screen.queryByRole("tab", { name: "Answer" })).not.toBeInTheDocument()
  expect(screen.getByText("get_time")).toBeVisible()
  await user.click(screen.getByRole("button", { name: "Statistics" }))
  expect(screen.getAllByText("Step 1")[0]).toBeVisible()
  expect(screen.getAllByText("Step 2")[0]).toBeVisible()
  expect(screen.getByText("18")).toBeVisible()
  expect(screen.getByText("0")).toBeVisible()
  expect(screen.queryByText("Output speed")).not.toBeInTheDocument()
})

it("resets removed request details for a new run without reopening them on completion", async () => {
  const user = userEvent.setup()
  const i18n = await createResourceTestI18n({ en: { aiApiVerification: en } })
  const output = (running: boolean) => (
    <I18nextProvider i18n={i18n}>
      <VerificationGenerationOutput
        text="OK"
        running={running}
        requestDetails={running ? undefined : <p>Raw request</p>}
      />
    </I18nextProvider>
  )
  const view = render(output(false))
  await user.click(screen.getByRole("button", { name: "Request details" }))
  view.rerender(output(true))
  expect(screen.getByText("OK")).toBeVisible()
  view.rerender(output(false))
  expect(
    screen.getByRole("button", { name: "Request details" }),
  ).toHaveAttribute("aria-expanded", "false")
})

it("preserves an open statistics disclosure when measurements temporarily disappear", async () => {
  const user = userEvent.setup()
  const i18n = await createResourceTestI18n({ en: { aiApiVerification: en } })
  const output = (measurements: boolean) => (
    <I18nextProvider i18n={i18n}>
      <VerificationGenerationOutput
        text="Retained answer"
        metrics={measurements ? [{ inputTokens: 18 }] : []}
      />
    </I18nextProvider>
  )
  const view = render(output(true))
  await user.click(screen.getByRole("button", { name: "Statistics" }))
  expect(screen.getByRole("dialog", { name: "Statistics" })).toBeVisible()
  view.rerender(output(false))
  expect(
    screen.queryByRole("dialog", { name: "Statistics" }),
  ).not.toBeInTheDocument()
  view.rerender(output(true))
  expect(screen.getByRole("dialog", { name: "Statistics" })).toBeVisible()
})
