import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { http, HttpResponse } from "msw"
import { afterEach, describe, expect, it, vi } from "vitest"
import { fakeBrowser } from "wxt/testing/fake-browser"

import { QuestionAnswerPanel } from "~/features/Verification/api/QuestionAnswerPanel"
import { useQuestionAnswerTest } from "~/features/Verification/api/useQuestionAnswerTest"
import en from "~/locales/en/aiApiVerification.json"
import { userPreferences } from "~/services/preferences/userPreferences"
import { server } from "~~/tests/msw/server"
import { testI18n } from "~~/tests/test-utils/i18n"
import { render } from "~~/tests/test-utils/render"

testI18n.addResourceBundle("en", "aiApiVerification", en)

function Workspace() {
  const controller = useQuestionAnswerTest({
    contextKey: "profile",
    enabled: true,
    blocked: false,
    resolveRequest: async () => ({
      baseUrl: "https://qa-ui.invalid",
      apiKey: "secret",
      apiType: "openai-compatible",
      modelId: "test",
      mode: "non-streaming",
      requestProfile: "default",
      requestProfileEnhanced: false,
      secrets: ["secret"],
    }),
  })
  return <QuestionAnswerPanel controller={controller} />
}

describe("question answer panel", () => {
  afterEach(() => vi.restoreAllMocks())
  it.each(["load", "save"])(
    "retries a failed preference %s from the warning",
    async (failure) => {
      const user = userEvent.setup()
      if (failure === "load")
        vi.spyOn(userPreferences, "getPreferencesStrict").mockRejectedValueOnce(
          new Error("Unavailable"),
        )
      render(<Workspace />, {
        withUserPreferencesProvider: false,
        withThemeProvider: false,
      })
      if (failure === "save") {
        const question = await screen.findByRole("textbox", {
          name: "Question",
        })
        await waitFor(() => expect(question).toBeEnabled())
        vi.spyOn(fakeBrowser.storage.local, "set").mockRejectedValue(
          new Error("Unavailable"),
        )
        await user.type(question, " Edited")
        await user.tab()
      }
      const retry = await screen.findByRole("button", { name: "Retry" })
      expect(screen.getByRole("alert")).toBeVisible()
      if (failure === "save") {
        const attempts = vi.mocked(fakeBrowser.storage.local.set).mock.calls
          .length
        await user.click(retry)
        await waitFor(() =>
          expect(fakeBrowser.storage.local.set).toHaveBeenCalledTimes(
            attempts + 1,
          ),
        )
        expect(screen.getByRole("alert")).toBeVisible()
        vi.mocked(fakeBrowser.storage.local.set).mockRestore()
      }
      await user.click(screen.getByRole("button", { name: "Retry" }))
      await waitFor(() =>
        expect(
          screen.queryByRole("button", { name: "Retry" }),
        ).not.toBeInTheDocument(),
      )
      expect(screen.getByRole("button", { name: "Run Q&A test" })).toBeEnabled()
    },
  )
  it("shows a failed request and allows the user to run again", async () => {
    const user = userEvent.setup()
    server.use(
      http.post("https://qa-ui.invalid/v1/chat/completions", () =>
        HttpResponse.error(),
      ),
    )
    render(<Workspace />)
    const run = await screen.findByRole("button", { name: "Run Q&A test" })
    await waitFor(() => expect(run).toBeEnabled())
    await user.click(run)
    expect(
      await screen.findByText("Request failed", { exact: true }),
    ).toBeVisible()
    expect(screen.getByRole("alert")).toBeVisible()
    expect(run).toBeEnabled()
  })
  it("shows a stopped request while its late response remains pending", async () => {
    const user = userEvent.setup()
    let release!: () => void
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    server.use(
      http.post("https://qa-ui.invalid/v1/chat/completions", async () => {
        await pending
        return HttpResponse.json({ choices: [] })
      }),
    )
    render(<Workspace />)
    const run = await screen.findByRole("button", { name: "Run Q&A test" })
    await waitFor(() => expect(run).toBeEnabled())
    try {
      await user.click(run)
      await user.click(await screen.findByRole("button", { name: "Stop" }))
      expect(await screen.findByText("Stopped", { exact: true })).toBeVisible()
      expect(screen.getByRole("button", { name: "Run Q&A test" })).toBeEnabled()
    } finally {
      release()
    }
  })
  it("explains exact answer matching on demand without redundant question hints", async () => {
    const user = userEvent.setup()
    render(<Workspace />)
    const question = await screen.findByRole("textbox", { name: "Question" })
    await waitFor(() => expect(question).toBeEnabled())
    expect(question).not.toHaveAccessibleDescription()
    const reference = screen.getByRole("textbox", {
      name: "Reference answer (optional)",
    })
    expect(reference).not.toHaveAccessibleDescription()
    const rules = screen.getByRole("button", { name: "Comparison rules" })
    expect(rules).toHaveAttribute("aria-expanded", "false")
    await user.click(rules)
    expect(rules).toHaveAttribute("aria-expanded", "true")
    expect(
      screen.getByText(/last line starting with FINAL_ANSWER:/),
    ).toBeVisible()
    expect(
      screen.getByText(
        /Without a reference, the response is shown without grading/,
      ),
    ).toBeVisible()
    expect(screen.getByText(/２１ matches 21/)).toBeVisible()
    expect(
      screen.getByText(/Case, punctuation and internal spaces still matter/),
    ).toBeVisible()
    expect(
      screen.getByText(/entire response matches the reference/),
    ).toBeVisible()
    expect(
      screen.getByText(
        "The reference is used locally and is never sent to the model.",
      ),
    ).toBeVisible()
  })

  it.each([
    ["FINAL_ANSWER: 21", "stop", "Matches reference", "21"],
    ["FINAL_ANSWER: 22", "stop", "Does not match reference", "22"],
    [
      "An explanation without a final answer.",
      "stop",
      "Final answer unclear",
      "Not identified",
    ],
    ["", "stop", "No answer returned", "Not identified"],
    ["FINAL_ANSWER: 21", "length", "Incomplete response", "21"],
  ])(
    "shows the compared answers for %s (%s)",
    async (text, finishReason, status, answer) => {
      const user = userEvent.setup()
      server.use(
        http.post("https://qa-ui.invalid/v1/chat/completions", () =>
          HttpResponse.json({
            choices: [
              {
                index: 0,
                finish_reason: finishReason,
                message: { role: "assistant", content: text },
              },
            ],
          }),
        ),
      )
      render(<Workspace />)
      const run = await screen.findByRole("button", { name: "Run Q&A test" })
      await waitFor(() => expect(run).toBeEnabled())
      await user.click(run)
      expect(
        (await screen.findAllByText(status, { exact: true }))[0],
      ).toBeVisible()
      const comparison = screen.getByRole("group", {
        name: "Answer comparison",
      })
      const values = within(comparison).getAllByRole("definition")
      expect(values[0]).toHaveTextContent(answer)
      expect(values[1]).toHaveTextContent("21")
      expect(
        within(comparison).getByText(
          "Only final-answer text is compared. Review the full response to assess the reasoning.",
        ),
      ).toBeVisible()
      // Editing the next reference must not change the evidence for this run.
      await user.clear(
        screen.getByRole("textbox", { name: "Reference answer (optional)" }),
      )
      expect(values[1]).toHaveTextContent("21")
    },
  )

  it("explains why a blank question cannot run and clears validation after editing", async () => {
    const user = userEvent.setup()
    render(<Workspace />)
    const question = await screen.findByRole("textbox", { name: "Question" })
    await waitFor(() => expect(question).toBeEnabled())
    await user.clear(question)
    await user.type(question, "   ")
    expect(question).toHaveAttribute("aria-invalid", "true")
    expect(question).toHaveAccessibleDescription(
      /Enter a question to run the test\./,
    )
    expect(screen.getByRole("button", { name: "Run Q&A test" })).toBeDisabled()
    await user.type(question, "Why?")
    expect(question).not.toHaveAttribute("aria-invalid", "true")
    expect(
      screen.queryByText("Enter a question to run the test."),
    ).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Run Q&A test" })).toBeEnabled()
  })

  it("edits the default question directly and resets the question and reference together", async () => {
    const user = userEvent.setup()
    render(<Workspace />)
    const question = await screen.findByRole("textbox", { name: "Question" })
    await waitFor(() => expect(question).toBeEnabled())
    expect(
      screen.queryByRole("button", { name: "Question" }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Reset question and answer" }),
    ).not.toBeInTheDocument()
    await user.clear(question)
    await user.type(question, "Keep this question.")
    const reference = screen.getByRole("textbox", {
      name: "Reference answer (optional)",
    })
    await user.clear(reference)
    await user.type(reference, "My answer")
    await user.click(
      screen.getByRole("button", { name: "Reset question and answer" }),
    )
    expect(question).toHaveDisplayValue(/黑色/)
    expect(reference).toHaveValue("21")
  })

  it("uses the optional reference to compare answers and keeps the run's question snapshot", async () => {
    const user = userEvent.setup()
    let sent: unknown
    server.use(
      http.post(
        "https://qa-ui.invalid/v1/chat/completions",
        async ({ request }) => {
          sent = await request.json()
          return HttpResponse.json({
            id: "qa",
            object: "chat.completion",
            created: 0,
            model: "test",
            choices: [
              {
                index: 0,
                finish_reason: "stop",
                message: {
                  role: "assistant",
                  content: "A useful explanation.",
                },
              },
            ],
          })
        },
      ),
    )
    render(<Workspace />)
    const question = await screen.findByRole("textbox", { name: "Question" })
    await waitFor(() => expect(question).toBeEnabled())
    await user.clear(question)
    await user.type(question, "Explain the sky.")
    const reference = screen.getByRole("textbox", {
      name: "Reference answer (optional)",
    })
    await user.clear(reference)
    await user.type(reference, "Private grading notes")
    await user.click(screen.getByRole("button", { name: "Run Q&A test" }))
    expect(await screen.findByText("A useful explanation.")).toBeVisible()
    expect(
      screen.getByText("Final answer unclear", { exact: true }),
    ).toBeVisible()
    expect(JSON.stringify(sent)).not.toContain("Private grading notes")
    await user.clear(reference)
    await user.click(screen.getByRole("button", { name: "Run Q&A test" }))
    expect(
      await screen.findByText("Response received", { exact: true }),
    ).toBeVisible()
    expect(sent).toMatchObject({
      messages: [{ role: "user", content: "Explain the sky." }],
    })
    await user.clear(question)
    expect(screen.getByRole("button", { name: "Run Q&A test" })).toBeDisabled()
    expect(
      screen.getByText(
        "The question or reference has changed. This result is from the previous run; run again to compare your changes.",
      ),
    ).toBeVisible()
    await user.click(
      screen.getByRole("button", { name: "Question used for this run" }),
    )
    expect(screen.getByText("Explain the sky.", { exact: true })).toBeVisible()
    await user.type(question, "Explain the sky.")
    expect(
      screen.queryByText(
        "The question or reference has changed. This result is from the previous run; run again to compare your changes.",
      ),
    ).not.toBeInTheDocument()
  })
})
