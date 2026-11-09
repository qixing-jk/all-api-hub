import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { I18nextProvider } from "react-i18next"
import { afterEach, expect, it, vi } from "vitest"

import { NeedlePanel } from "~/features/Verification/api/NeedlePanel"
import { useNeedleTest } from "~/features/Verification/api/useNeedleTest"
import en from "~/locales/en/aiApiVerification.json"
import { modelMetadataService } from "~/services/models/modelMetadata"
import { MODEL_METADATA_URL } from "~/services/models/modelMetadata/constants"
import {
  NEEDLE_OUTCOMES,
  NEEDLE_RUN_REASONS,
} from "~/services/verification/modelQuality/needleConstants"
import { createNeedlePlan } from "~/services/verification/modelQuality/needlePlan"
import { runNeedleTest } from "~/services/verification/modelQuality/needleRun"
import { createDeferred } from "~~/tests/test-utils/deferred"
import { createResourceTestI18n } from "~~/tests/test-utils/i18n"

afterEach(() => {
  vi.unstubAllGlobals()
  modelMetadataService.clearCache()
})

it.each([
  "hit",
  "miss",
  "error",
  "context-limit",
  "incomplete",
  "interrupted",
  "cancelled",
  "untested",
] as const)(
  "runs and reruns a selected %s cell without changing other results",
  async (outcome) => {
    const user = userEvent.setup()
    const i18n = await createResourceTestI18n({ en: { aiApiVerification: en } })
    const counter = {
      encoding: "o200k_base",
      estimated: true,
      declaredInput: 16384,
    }
    const coordinate = { targetTokens: 8192, depth: 50 }
    const pending = createDeferred<void>()
    let requests = 0
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown) => {
        if (String(url) === MODEL_METADATA_URL)
          return Response.json({ models: [] })
        requests++
        await pending.promise
        return Response.json({
          id: "needle",
          object: "chat.completion",
          created: 1,
          model: "test",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: "wrong" },
              finish_reason: "stop",
            },
          ],
        })
      }),
    )
    const previous = {
      version: 1,
      seed: 123,
      counter,
      plan: createNeedlePlan({ counter }),
      reason: NEEDLE_RUN_REASONS.Complete,
      cells: [
        {
          targetTokens: 16384,
          depth: 90,
          actualDepth: 90,
          localInputTokens: 16380,
          outcome: NEEDLE_OUTCOMES.Hit,
        },
        ...(outcome === "untested" || outcome === "cancelled"
          ? []
          : [
              {
                ...coordinate,
                actualDepth: 50,
                localInputTokens: 8190,
                outcome,
              },
            ]),
      ],
      ...(outcome === "cancelled"
        ? {
            scheduled: [coordinate],
            cancelled: [coordinate],
            reason: NEEDLE_RUN_REASONS.Stopped,
          }
        : {}),
    }
    function Harness() {
      const controller = useNeedleTest({
        enabled: true,
        blocked: false,
        contextKey: "rerun",
        modelId: "test",
        resolveRequest: async () => ({
          baseUrl: "https://example.invalid",
          apiKey: "test",
          apiType: "openai-compatible",
          modelId: "test",
          mode: "non-streaming",
          requestProfile: "default",
          requestProfileEnhanced: false,
          secrets: [],
        }),
        loadCounter: async () => counter,
        historyAccess: {
          get: async () => ({
            result: previous,
            targetKey: "rerun",
            scopeKey: "rerun",
            verifiedAt: 1,
          }),
          save: async () => {},
        },
        runner: runNeedleTest,
      })
      return (
        <NeedlePanel
          controller={controller}
          runCapacity={() => {}}
          canRunCapacity={false}
        />
      )
    }
    render(
      <I18nextProvider i18n={i18n}>
        <Harness />
      </I18nextProvider>,
    )
    await screen.findByRole("button", { name: "16384 tokens · 90%: Match" })
    await user.click(
      screen.getByRole("button", { name: /^8192 tokens · 50%:/ }),
    )
    const details = within(screen.getByRole("region", { name: "Cell details" }))
    expect(requests).toBe(0)
    try {
      await user.click(
        details.getByRole("button", {
          name: outcome === "untested" ? "Run this cell" : "Retest this cell",
        }),
      )
      await waitFor(() => expect(requests).toBe(1))
      expect(
        details.getByRole("button", { name: "Stop 8K · 50%" }),
      ).toBeEnabled()
      expect(
        screen.getByRole("button", { name: "16384 tokens · 90%: Match" }),
      ).toBeVisible()
    } finally {
      pending.resolve()
    }
    await waitFor(() =>
      expect(
        details.getByRole("button", { name: "Retest this cell" }),
      ).toBeEnabled(),
    )
    expect(
      screen.getByRole("button", { name: "8192 tokens · 50%: Miss" }),
    ).toBeVisible()
    await user.click(details.getByRole("button", { name: "Retest this cell" }))
    await waitFor(() => expect(requests).toBe(2))
    await waitFor(() =>
      expect(
        details.getByRole("button", { name: "Retest this cell" }),
      ).toBeEnabled(),
    )
    expect(
      screen.getByRole("button", { name: "16384 tokens · 90%: Match" }),
    ).toBeVisible()
    expect(screen.getByText(/Processed 1\/1 requests/)).toBeVisible()
  },
)

it.each(["complete", "stop", "error", "cell", "retry"])(
  "distinguishes active and waiting cells until %s",
  async (ending) => {
    const user = userEvent.setup()
    const i18n = await createResourceTestI18n({ en: { aiApiVerification: en } })
    const pending = createDeferred<void>()
    const persisted = createDeferred<void>()
    const settled = createDeferred<void>()
    let requests = 0
    let cancellationAttempts = 0
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown, init?: RequestInit) => {
        if (String(url) === MODEL_METADATA_URL)
          return Response.json({ models: [] })
        requests++
        if (requests === 2) {
          await Promise.race([
            pending.promise,
            new Promise((_, reject) =>
              init?.signal?.addEventListener(
                "abort",
                () => reject(init.signal?.reason),
                { once: true },
              ),
            ),
          ])
          if (ending === "error")
            return Response.json(
              { error: { message: "Unavailable" } },
              { status: 503 },
            )
        }
        return Response.json({
          id: "needle",
          object: "chat.completion",
          created: 1,
          model: "test",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: "wrong" },
              finish_reason: "stop",
            },
          ],
        })
      }),
    )
    function Harness() {
      const controller = useNeedleTest({
        enabled: true,
        blocked: false,
        contextKey: "progress",
        modelId: "test",
        resolveRequest: async () => ({
          baseUrl: "https://example.invalid",
          apiKey: "test",
          apiType: "openai-compatible",
          modelId: "test",
          mode: "non-streaming",
          requestProfile: "default",
          requestProfileEnhanced: false,
          secrets: [],
        }),
        loadCounter: async () => ({
          encoding: "o200k_base",
          estimated: true,
          declaredInput: 1024,
        }),
        historyAccess: { get: async () => null, save: async () => {} },
        runner: async (params) => {
          const result = await runNeedleTest({
            ...params,
            onControls: (controls) =>
              params.onControls?.(
                ending === "retry"
                  ? {
                      stopSelection: async (selection) => {
                        if (++cancellationAttempts === 1)
                          throw new Error("Unavailable")
                        return controls.stopSelection(selection)
                      },
                    }
                  : controls,
              ),
          })
          settled.resolve()
          if (ending === "cell" || ending === "retry") await persisted.promise
          return result
        },
      })
      return (
        <NeedlePanel
          controller={controller}
          runCapacity={() => {}}
          canRunCapacity={false}
        />
      )
    }
    render(
      <I18nextProvider i18n={i18n}>
        <Harness />
      </I18nextProvider>,
    )
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Run needle test" }),
      ).toBeEnabled(),
    )
    await user.click(
      within(screen.getByRole("region", { name: "Test preview" })).getByRole(
        "button",
        { name: "Run" },
      ),
    )
    const result = () =>
      within(screen.getByRole("region", { name: "Execution result" }))
    await waitFor(() => expect(requests).toBe(2))
    try {
      const matrix = screen.getByRole("table")
      const cells = within(matrix).getAllByRole("cell")
      expect(cells[0]).toHaveTextContent("Miss")
      expect(cells[1]).toHaveTextContent("Running...")
      expect(cells[2]).toHaveTextContent("Pending")
      expect(screen.getByText(/Processed 1\/3 requests/)).toBeVisible()
      expect(result().getByRole("button", { name: "Stop" })).toBeEnabled()
      expect(result().getByRole("button", { name: "Stop" })).toHaveAttribute(
        "aria-busy",
        "true",
      )
      if (ending === "stop")
        await user.click(result().getByRole("button", { name: "Stop" }))
      if (ending === "cell" || ending === "retry") {
        const status = within(matrix).getByRole("button", {
          name: "1024 tokens · 50%: Running...",
        })
        await user.hover(status)
        expect(
          screen.queryByRole("dialog", { name: "Cell details" }),
        ).not.toBeInTheDocument()
        expect(
          screen.queryByRole("region", { name: "Cell details" }),
        ).not.toBeInTheDocument()
        await user.click(status)
        expect(
          screen.getByRole("region", { name: "Cell details" }),
        ).toHaveTextContent("Running...")
        expect(status).toHaveAttribute("aria-pressed", "true")
        expect(requests).toBe(2)
        const details = within(
          screen.getByRole("region", { name: "Cell details" }),
        )
        await user.click(details.getByRole("button", { name: "Stop 1K · 50%" }))
        if (ending === "retry") {
          expect(await screen.findByRole("tooltip")).toHaveTextContent(
            "Could not stop. Try again.",
          )
          expect(screen.queryByRole("alert")).not.toBeInTheDocument()
          expect(requests).toBe(2)
          await user.click(
            details.getByRole("button", { name: "Stop 1K · 50%" }),
          )
          expect(
            screen.queryByText("Could not stop. Try again."),
          ).not.toBeInTheDocument()
        }
        await settled.promise
        await waitFor(() =>
          expect(within(matrix).getAllByRole("cell")[1]).toHaveTextContent(
            "Cancelled",
          ),
        )
        expect(within(matrix).queryByText("Pending")).not.toBeInTheDocument()
        expect(
          within(matrix).queryByRole("button", { name: /^Stop / }),
        ).not.toBeInTheDocument()
      }
    } finally {
      pending.resolve()
      persisted.resolve()
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: "Run needle test" }),
        ).toBeEnabled(),
      )
    }
    const matrix = within(screen.getByRole("table"))
    expect(result().getByRole("button", { name: "Run" })).toBeEnabled()
    expect(matrix.queryByText("Running...")).not.toBeInTheDocument()
    expect(matrix.queryByText("Pending")).not.toBeInTheDocument()
    if (ending === "complete") {
      expect(screen.getByText(/Processed 3\/3 requests/)).toBeVisible()
      expect(
        matrix
          .getAllByRole("cell")
          .every((cell) => cell.textContent === "Miss"),
      ).toBe(true)
    } else if (ending === "cell" || ending === "retry") {
      expect(requests).toBe(3)
      expect(matrix.getAllByRole("cell")[0]).toHaveTextContent("Miss")
      expect(matrix.getAllByRole("cell")[1]).toHaveTextContent("Cancelled")
      expect(matrix.getAllByRole("cell")[2]).toHaveTextContent("Miss")
      await user.click(
        matrix.getByRole("button", { name: "1024 tokens · 50%: Cancelled" }),
      )
      expect(
        screen.getByRole("region", { name: "Cell details" }),
      ).toHaveTextContent("Cancelled")
      expect(
        screen.queryByText("Previous result (before this run)"),
      ).not.toBeInTheDocument()
    } else {
      expect(requests).toBe(2)
      expect(matrix.getAllByRole("cell")[1]).toHaveTextContent(
        ending === "stop" ? "Unknown" : "Error",
      )
      expect(matrix.getAllByRole("cell")[2]).toHaveTextContent("Not run")
    }
  },
)
