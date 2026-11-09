import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { I18nextProvider } from "react-i18next"
import { expect, it, vi } from "vitest"

import { NeedlePanel } from "~/features/Verification/api/NeedlePanel"
import { NeedlePlanHelp } from "~/features/Verification/api/NeedlePlanHelp"
import { useNeedleTest } from "~/features/Verification/api/useNeedleTest"
import en from "~/locales/en/aiApiVerification.json"
import {
  NEEDLE_OUTCOMES,
  NEEDLE_RUN_REASONS,
} from "~/services/verification/modelQuality/needleConstants"
import { createNeedlePlan } from "~/services/verification/modelQuality/needlePlan"
import { createDeferred } from "~~/tests/test-utils/deferred"
import { createResourceTestI18n } from "~~/tests/test-utils/i18n"

it("defaults to the longest length and preserves the user's mode across models", async () => {
  const user = userEvent.setup()
  const i18n = await createResourceTestI18n({ en: { aiApiVerification: en } })
  const runner = vi.fn()
  function Harness({ modelId }: { modelId: string }) {
    const controller = useNeedleTest({
      enabled: true,
      blocked: false,
      contextKey: modelId,
      modelId,
      resolveRequest: async () => null,
      loadCounter: async () => ({
        encoding: "o200k_base",
        estimated: true,
        declaredContext: modelId === "small" ? 32768 : 131072,
      }),
      runner,
    })
    return (
      <NeedlePanel
        controller={controller}
        runCapacity={() => {}}
        canRunCapacity={false}
      />
    )
  }
  const view = render(
    <I18nextProvider i18n={i18n}>
      <Harness modelId="small" />
    </I18nextProvider>,
  )
  const quick = screen.getByRole("switch", {
    name: "Test only the longest text",
  })
  expect(quick).toBeChecked()
  expect(await screen.findByText("3 requests")).toBeVisible()
  const preview = screen.getByRole("region", { name: "Test preview" })
  expect(
    within(preview).getByRole("heading", { name: "Test preview" }),
  ).toBeVisible()
  expect(within(preview).getByRole("table")).toBeVisible()
  expect(
    within(screen.getByRole("group", { name: "Test settings" })).queryByRole(
      "table",
    ),
  ).not.toBeInTheDocument()
  const matrix = within(screen.getByRole("table"))
  expect(matrix.getAllByText("Not in this run")).toHaveLength(6)
  expect(matrix.getAllByText("Planned")).toHaveLength(3)
  await user.click(quick)
  expect(quick).not.toBeChecked()
  expect(screen.getByText("9 requests")).toBeVisible()
  expect(matrix.queryByText("Not in this run")).not.toBeInTheDocument()
  expect(matrix.getAllByText("Planned")).toHaveLength(9)
  await user.click(
    matrix.getByRole("button", { name: "31744 tokens · 50%: Planned" }),
  )
  expect(
    within(screen.getByRole("region", { name: "Cell details" })).getByRole(
      "button",
      { name: "Run this cell" },
    ),
  ).toBeEnabled()
  view.rerender(
    <I18nextProvider i18n={i18n}>
      <Harness modelId="large" />
    </I18nextProvider>,
  )
  expect(await screen.findByText("15 requests")).toBeVisible()
  expect(
    screen.queryByRole("region", { name: "Cell details" }),
  ).not.toBeInTheDocument()
  expect(quick).not.toBeChecked()
  await user.click(quick)
  view.rerender(
    <I18nextProvider i18n={i18n}>
      <Harness modelId="small" />
    </I18nextProvider>,
  )
  expect(
    await within(
      await screen.findByRole("group", {
        name: en.verifyDialog.tools.needle.plannedLengths,
      }),
    ).findByText("31K"),
  ).toBeVisible()
  expect(quick).toBeChecked()
  expect(screen.getByText("3 requests")).toBeVisible()
  expect(runner).not.toHaveBeenCalled()
})

it("allows cell and column cancellation before any request is ready", async () => {
  const user = userEvent.setup()
  const i18n = await createResourceTestI18n({ en: { aiApiVerification: en } })
  const request = createDeferred<void>()
  const runner = vi.fn()
  function Harness() {
    const controller = useNeedleTest({
      enabled: true,
      blocked: false,
      contextKey: "preparing",
      modelId: "test",
      resolveHistoryRequest: async () => null,
      resolveRequest: async () => {
        await request.promise
        return {
          baseUrl: "https://example.invalid",
          apiKey: "test",
          apiType: "openai-compatible",
          modelId: "test",
          mode: "non-streaming",
          requestProfile: "default",
          requestProfileEnhanced: false,
          secrets: [],
        }
      },
      loadCounter: async () => ({
        encoding: "o200k_base",
        estimated: true,
        declaredInput: 16384,
      }),
      runner,
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
  await user.click(
    await screen.findByRole("button", { name: "Run 50% column (2 requests)" }),
  )
  try {
    const result = within(
      screen.getByRole("region", { name: "Execution result" }),
    )
    expect(
      screen.queryByRole("region", { name: "Test preview" }),
    ).not.toBeInTheDocument()
    expect(result.getByRole("table")).toBeVisible()
    expect(result.getByRole("button", { name: "Stop" })).toBeEnabled()
    expect(result.getByText("2 requests")).toBeVisible()
    expect(result.getByText("Each length is tested at 50%.")).toBeVisible()
    const matrix = within(screen.getByRole("table"))
    expect(matrix.getAllByText("Pending")).toHaveLength(2)
    expect(matrix.getAllByText("Not in this run")).toHaveLength(4)
    expect(runner).not.toHaveBeenCalled()
    await user.click(
      matrix.getByRole("button", { name: "8192 tokens · 50%: Pending" }),
    )
    const stopCell = within(
      screen.getByRole("region", { name: "Cell details" }),
    ).getByRole("button", { name: "Stop 8K · 50%" })
    expect(stopCell).toBeEnabled()
    await user.click(stopCell)
    expect(
      matrix.getByRole("button", { name: "8192 tokens · 50%: Cancelled" }),
    ).toBeVisible()
    expect(matrix.getAllByText("Pending")).toHaveLength(1)
    await user.click(matrix.getByRole("button", { name: "Stop 50% column" }))
    expect(matrix.getAllByText("Cancelled")).toHaveLength(2)
  } finally {
    request.resolve()
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Run needle test" }),
      ).toBeEnabled(),
    )
  }
  expect(runner).not.toHaveBeenCalled()
  expect(screen.queryByText("Preparing test requests…")).not.toBeInTheDocument()
})

it("starts preparation at zero when retesting a column with partial saved results", async () => {
  const user = userEvent.setup()
  const i18n = await createResourceTestI18n({ en: { aiApiVerification: en } })
  const pending = createDeferred<void>()
  const counter = {
    encoding: "o200k_base",
    estimated: true,
    declaredInput: 16384,
  }
  const request = {
    baseUrl: "https://example.invalid",
    apiKey: "test",
    apiType: "openai-compatible" as const,
    modelId: "test",
    mode: "non-streaming" as const,
    requestProfile: "default" as const,
    requestProfileEnhanced: false,
    secrets: [],
  }
  const saved = {
    version: 1,
    seed: 123,
    counter,
    plan: createNeedlePlan({ counter, quick: true }),
    reason: NEEDLE_RUN_REASONS.Complete,
    scheduled: [10, 50, 90].map((depth) => ({ targetTokens: 16384, depth })),
    processed: 3,
    cells: [10, 50, 90].map((depth) => ({
      targetTokens: 16384,
      depth,
      actualDepth: depth,
      localInputTokens: 16380,
      outcome: NEEDLE_OUTCOMES.Hit,
    })),
  }
  function Harness() {
    const controller = useNeedleTest({
      enabled: true,
      blocked: false,
      contextKey: "saved",
      modelId: "test",
      resolveHistoryRequest: async () => request,
      resolveRequest: async () => {
        await pending.promise
        return null
      },
      loadCounter: async () => counter,
      historyAccess: {
        get: vi.fn().mockResolvedValue({ result: saved }),
        save: async () => {},
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
  await screen.findByText(/Processed 3\/3 requests/)
  const historyBadge = screen.getByRole("button", { name: /^Previously:/ })
  await user.click(historyBadge)
  expect(await screen.findByRole("tooltip")).toHaveTextContent(
    "History keeps measurements",
  )
  await user.keyboard("{Escape}")
  await user.click(
    screen.getByRole("button", { name: "Test parameters and reproduction" }),
  )
  expect(
    screen.queryByText(/Only measurements are saved/),
  ).not.toBeInTheDocument()
  await user.click(
    screen.getByRole("button", { name: "Retest 50% column (2 requests)" }),
  )
  try {
    expect(
      screen.queryByText("Preparing test requests…"),
    ).not.toBeInTheDocument()
    expect(screen.getByText(/Processed 0\/2 requests/)).toBeVisible()
    const matrix = within(screen.getByRole("table"))
    expect(matrix.getAllByText("Match")).toHaveLength(2)
    expect(matrix.getAllByText("Pending")).toHaveLength(2)
    expect(matrix.getAllByText("Not in this run")).toHaveLength(2)
  } finally {
    pending.resolve()
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Run needle test" }),
      ).toBeEnabled(),
    )
  }
  expect(screen.queryByText("Preparing test requests…")).not.toBeInTheDocument()
  expect(screen.getByText(/Processed 3\/3 requests/)).toBeVisible()
})

it.each([
  {
    limits: { declaredInput: 30000 },
    text: "separate input limit of 29.3K (30,000)",
    reserve: false,
  },
  {
    limits: { declaredInput: 30000, declaredContext: 32768 },
    text: "separate input limit of 29.3K (30,000)",
    reserve: false,
  },
  {
    limits: { declaredInput: 50000, declaredContext: 32768 },
    text: "Reserving 1K (1,024) for the reply leaves an input limit of 31K (31,744)",
    reserve: true,
  },
  {
    limits: { declaredContext: 2097152 },
    text: "input limit of 2M (2,096,128)",
    reserve: true,
  },
])(
  "explains the effective metadata constraint for $limits",
  async ({ limits, text, reserve }) => {
    const user = userEvent.setup()
    const i18n = await createResourceTestI18n({ en: { aiApiVerification: en } })
    const counter = { encoding: "o200k_base", estimated: true, ...limits }
    render(
      <I18nextProvider i18n={i18n}>
        <NeedlePlanHelp
          counter={counter}
          plan={createNeedlePlan({ counter })}
        />
      </I18nextProvider>,
    )
    await user.click(
      screen.getByRole("button", { name: "How are lengths chosen?" }),
    )
    expect(screen.getByText((value) => value.includes(text))).toBeVisible()
    expect(Boolean(screen.queryByText(/Reserving/))).toBe(reserve)
    if (limits.declaredContext === 2097152) {
      expect(screen.getByText(/capped at 1M/)).toBeVisible()
    }
  },
)

it("explains a compact plan with keyboard-accessible exact numbers without running it", async () => {
  const user = userEvent.setup()
  const i18n = await createResourceTestI18n({ en: { aiApiVerification: en } })
  const runner = vi.fn()
  function Harness() {
    const controller = useNeedleTest({
      enabled: true,
      blocked: false,
      contextKey: "compact",
      modelId: "test",
      resolveRequest: async () => null,
      loadCounter: async () => ({
        encoding: "o200k_base",
        estimated: true,
        declaredContext: 131072,
      }),
      runner,
    })
    return (
      <I18nextProvider i18n={i18n}>
        <NeedlePanel
          controller={controller}
          runCapacity={vi.fn()}
          canRunCapacity
        />
      </I18nextProvider>
    )
  }
  render(<Harness />)
  await user.click(
    screen.getByRole("switch", { name: "Test only the longest text" }),
  )
  expect(
    await within(
      await screen.findByRole("group", {
        name: en.verifyDialog.tools.needle.plannedLengths,
      }),
    ).findByText("127K"),
  ).toBeVisible()
  expect(screen.getByText(/741K/)).toBeVisible()
  expect(screen.getByText(/15 requests/)).toBeVisible()
  expect(screen.queryByText(/130,048/)).not.toBeInTheDocument()
  const settings = screen.getByRole("group", { name: "Test settings" })
  const preview = screen.getByRole("region", { name: "Test preview" })
  expect(within(preview).getByText(/741K/)).toBeVisible()
  expect(within(preview).queryByRole("spinbutton")).not.toBeInTheDocument()
  expect(within(settings).queryByText(/741K/)).not.toBeInTheDocument()
  const limit = screen.getByRole("combobox", {
    name: "Maximum text length (tokens)",
  })
  expect(limit).toHaveTextContent("Automatic (127K)")
  expect(
    within(settings).queryByRole("spinbutton", {
      name: "Custom length (tokens)",
    }),
  ).not.toBeInTheDocument()
  expect(limit).toHaveAccessibleDescription(
    "Model metadata: 128K context (unverified)",
  )
  await user.click(limit)
  await user.click(screen.getByRole("option", { name: "64K" }))
  expect(limit).toHaveTextContent("64K")
  expect(limit).toHaveAccessibleDescription(
    "Model metadata: 128K context (unverified)",
  )
  await user.click(limit)
  await user.click(screen.getByRole("option", { name: "Custom" }))
  const custom = screen.getByRole("spinbutton", {
    name: "Custom length (tokens)",
  })
  expect(custom).toHaveValue(65536)
  await user.clear(custom)
  await user.type(custom, "16384")
  expect(custom).toHaveValue(16384)
  expect(limit).toHaveTextContent("Custom")
  expect(
    within(
      screen.getByRole("group", {
        name: en.verifyDialog.tools.needle.plannedLengths,
      }),
    ).getByText("16K"),
  ).toBeVisible()
  await user.click(limit)
  await user.click(screen.getByRole("option", { name: "Automatic (127K)" }))
  expect(custom).not.toBeInTheDocument()
  const explanation = within(settings).getByRole("button", {
    name: "How are lengths chosen?",
  })
  expect(
    within(preview).queryByRole("button", {
      name: "How are lengths chosen?",
    }),
  ).not.toBeInTheDocument()
  await user.hover(explanation)
  expect(
    await screen.findByRole("dialog", { name: "How are lengths chosen?" }),
  ).toBeVisible()
  await user.unhover(explanation)
  await waitFor(() =>
    expect(
      screen.queryByRole("dialog", { name: "How are lengths chosen?" }),
    ).not.toBeInTheDocument(),
  )
  await user.tab({ shift: true })
  expect(explanation).toHaveFocus()
  expect(
    await screen.findByRole("dialog", { name: "How are lengths chosen?" }),
  ).toBeVisible()
  await user.keyboard("{Enter}")
  expect(explanation).toHaveAttribute("aria-expanded", "true")
  const help = screen.getByRole("dialog", { name: "How are lengths chosen?" })
  expect(within(help).getByText(/128K.*1K.*127K/)).toBeVisible()
  expect(within(help).getByText(/Exact lengths:.*130,048/)).toBeVisible()
  expect(within(help).getByText(/758,784/)).toBeVisible()
  expect(within(help).getByText(/1K = 1,024/)).toBeVisible()
  await user.keyboard("{Escape}")
  expect(help).not.toBeInTheDocument()
  expect(explanation).toHaveFocus()
  expect(runner).not.toHaveBeenCalled()
})

it("offers a context probe for unknown capacity and updates the automatic plan after it completes", async () => {
  const user = userEvent.setup()
  const i18n = await createResourceTestI18n({ en: { aiApiVerification: en } })
  const probe = vi.fn()
  const runner = vi.fn()
  const loadCounter = async () => ({ encoding: "o200k_base", estimated: true })
  const resolveRequest = async () => ({
    baseUrl: "https://example.invalid",
    apiKey: "test",
    apiType: "openai-compatible" as const,
    modelId: "test",
    mode: "non-streaming" as const,
    requestProfile: "default" as const,
    requestProfileEnhanced: false,
    secrets: [],
  })
  const history = { get: async () => null, save: async () => {} }
  function Harness({ measured = 0 }: { measured?: number }) {
    const controller = useNeedleTest({
      enabled: true,
      blocked: false,
      contextKey: "current",
      modelId: "test",
      resolveRequest,
      loadCounter,
      runner,
      historyAccess: history,
      capacity: measured
        ? {
            lowerBoundTokens: measured,
            counter: { encoding: "o200k_base", estimated: true },
          }
        : undefined,
    })
    return (
      <I18nextProvider i18n={i18n}>
        <NeedlePanel
          controller={controller}
          runCapacity={probe}
          canRunCapacity
        />
      </I18nextProvider>
    )
  }
  const view = render(<Harness />)
  await user.click(
    screen.getByRole("switch", { name: "Test only the longest text" }),
  )
  expect(screen.getByRole("list", { name: "Test steps" })).toBeInTheDocument()
  expect(
    screen.getByText(en.verifyDialog.tools.needle.description),
  ).toBeVisible()
  expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  expect(
    await screen.findByText(
      "Context limit unavailable. Automatic uses 16K tokens until a context check provides a new value.",
    ),
  ).toBeVisible()
  const initialLimit = screen.getByRole("combobox", {
    name: "Maximum text length (tokens)",
  })
  expect(initialLimit).toBeVisible()
  expect(
    screen.getByRole("spinbutton", { name: "Test sample ID (optional)" }),
  ).toBeVisible()
  expect(initialLimit).toHaveAccessibleDescription(
    "Context limit unavailable. Automatic uses 16K tokens until a context check provides a new value.",
  )
  const detect = screen.getByRole("button", { name: "Check available context" })
  await user.hover(detect)
  const detectionHint = await screen.findByRole("tooltip")
  expect(detectionHint).toHaveTextContent(
    "Context limit unavailable. Automatic uses 16K tokens until a context check provides a new value.",
  )
  expect(probe).not.toHaveBeenCalled()
  await user.unhover(detect)
  await waitFor(() => expect(detectionHint).not.toBeVisible())
  await user.click(initialLimit)
  const presets = screen.getByRole("listbox")
  expect(within(presets).getAllByRole("option")).toHaveLength(9)
  expect(
    within(presets).queryByRole("button", { name: "Check available context" }),
  ).not.toBeInTheDocument()
  await user.click(within(presets).getByRole("option", { name: "1M" }))
  expect(initialLimit).toHaveTextContent("1M")
  await user.click(initialLimit)
  await user.click(screen.getByRole("option", { name: "64K" }))
  expect(initialLimit).toHaveTextContent("64K")
  expect(
    screen.getByText(
      "Context limit unavailable. Automatic uses 16K tokens until a context check provides a new value.",
    ),
  ).toBeVisible()
  expect(screen.getByText("12 requests")).toBeVisible()
  expect(runner).not.toHaveBeenCalled()
  await user.click(initialLimit)
  await user.click(screen.getByRole("option", { name: "Automatic (16K)" }))
  expect(initialLimit).toHaveTextContent("Automatic (16K)")
  await user.click(
    await screen.findByRole("button", { name: "Check available context" }),
  )
  expect(probe).toHaveBeenCalledOnce()
  expect(runner).not.toHaveBeenCalled()
  view.rerender(<Harness measured={32768} />)
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: "Check available context" }),
    ).not.toBeInTheDocument(),
  )
  expect(
    screen.getByText("Previously accepted: 32K input (maximum unknown)"),
  ).toBeVisible()
  expect(initialLimit).toHaveTextContent("Automatic (32K)")
  await user.click(initialLimit)
  expect(screen.getByRole("option", { name: "1M" })).toBeVisible()
  await user.keyboard("{Escape}")
  await user.click(
    screen.getByRole("button", { name: "How are lengths chosen?" }),
  )
  expect(screen.getByText(/previously accepted.*32K/)).toBeVisible()
  expect(screen.getByRole("button", { name: "Run needle test" })).toBeEnabled()
  expect(initialLimit).toHaveAccessibleDescription(
    "Previously accepted: 32K input (maximum unknown)",
  )
  const quick = screen.getByRole("switch", {
    name: "Test only the longest text",
  })
  expect(quick).toHaveAccessibleDescription(
    "Run only the three positions at the longest planned length. Other lengths are excluded from this run and can be tested separately by row or column.",
  )
  await user.click(quick)
  expect(screen.getByText("3 requests")).toBeInTheDocument()
  const seed = screen.getByRole("spinbutton", {
    name: "Test sample ID (optional)",
  })
  expect(seed).toHaveAccessibleDescription(
    "Leave blank for a new sample each time. Use the same ID and settings to repeat a sample.",
  )
  await user.type(seed, "42")
  expect(
    screen.getByRole("spinbutton", { name: "Test sample ID (optional)" }),
  ).toHaveValue(42)
  await user.click(initialLimit)
  await user.click(screen.getByRole("option", { name: "Custom" }))
  const limit = screen.getByRole("spinbutton", {
    name: "Custom length (tokens)",
  })
  expect(limit).toHaveValue(32768)
  await user.clear(limit)
  await user.type(limit, "0")
  expect(screen.getByRole("alert")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Run needle test" })).toBeDisabled()
  await user.clear(limit)
  await user.type(limit, "1024")
  expect(
    within(
      screen.getByRole("group", {
        name: en.verifyDialog.tools.needle.plannedLengths,
      }),
    ).getByText("1K"),
  ).toBeInTheDocument()
  await user.click(
    screen.getByRole("button", { name: "How are lengths chosen?" }),
  )
  expect(screen.getByText(/You set the maximum test input to 1K/)).toBeVisible()
  expect(screen.getByText(/just one length: 1K/)).toBeVisible()
  await user.click(
    screen.getByRole("button", { name: "How are lengths chosen?" }),
  )
  expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  runner.mockResolvedValue({
    version: 1,
    seed: 42,
    counter: { encoding: "o200k_base", estimated: true },
    plan: createNeedlePlan({
      counter: { encoding: "o200k_base", estimated: true },
    }),
    reason: NEEDLE_RUN_REASONS.Interrupted,
    scheduled: [{ targetTokens: 8192, depth: 10 }],
    cells: [
      {
        targetTokens: 8192,
        depth: 10,
        actualDepth: 10,
        localInputTokens: 0,
        outcome: NEEDLE_OUTCOMES.Interrupted,
      },
    ],
  })
  await user.click(screen.getByRole("button", { name: "Run needle test" }))
  await user.click(await screen.findByRole("button", { name: /10%: Unknown/ }))
  expect(screen.queryByText(/0 tokens.*10.0%.*0 ms/)).not.toBeInTheDocument()
  expect(
    within(
      screen.getByRole("group", {
        name: en.verifyDialog.tools.needle.plannedLengths,
      }),
    ).getByText("8K"),
  ).toBeVisible()
  expect(
    within(screen.getByRole("region", { name: "Execution result" })).getByRole(
      "button",
      { name: "Run" },
    ),
  ).toHaveAccessibleDescription("3 requests")
  expect(
    screen.getByRole("rowheader", { name: "8,192 tokens" }),
  ).toHaveTextContent("8K")
  expect(screen.queryByText(/Sample 42/)).not.toBeInTheDocument()
  await user.click(
    screen.getByRole("button", { name: "Test parameters and reproduction" }),
  )
  expect(screen.getByText(/Sample 42/)).toBeInTheDocument()
})

it("regenerates presets for the model's input limit without running a test", async () => {
  const user = userEvent.setup()
  const i18n = await createResourceTestI18n({ en: { aiApiVerification: en } })
  const runner = vi.fn()
  function Harness({
    declaredContext = 1048576,
  }: {
    declaredContext?: number
  }) {
    const controller = useNeedleTest({
      enabled: true,
      blocked: false,
      contextKey: `model-${declaredContext}`,
      modelId: "test",
      resolveRequest: async () => null,
      loadCounter: async () => ({
        encoding: "o200k_base",
        estimated: true,
        declaredContext,
      }),
      runner,
    })
    return (
      <I18nextProvider i18n={i18n}>
        <NeedlePanel
          controller={controller}
          runCapacity={vi.fn()}
          canRunCapacity
        />
      </I18nextProvider>
    )
  }
  const view = render(<Harness />)
  await user.click(
    screen.getByRole("switch", { name: "Test only the longest text" }),
  )
  const limit = screen.getByRole("combobox", {
    name: "Maximum text length (tokens)",
  })
  await waitFor(() => expect(limit).toHaveTextContent("Automatic (1023K)"))
  await user.click(limit)
  const presets = screen.getByRole("listbox")
  const preview = screen.getByRole("region", { name: "Test preview" })
  expect(
    within(presets).queryByRole("option", { name: "1M" }),
  ).not.toBeInTheDocument()
  await user.keyboard("{Escape}")
  for (const label of ["256K", "512K", "1023K"]) {
    await user.click(limit)
    const preset = screen.getByRole("option", { name: label })
    await user.click(preset)
    expect(limit).toHaveTextContent(label)
    expect(
      within(
        screen.getByRole("group", {
          name: en.verifyDialog.tools.needle.plannedLengths,
        }),
      ).getByText(label),
    ).toBeVisible()
  }
  expect(within(preview).getByText("24 requests")).toBeVisible()
  await user.click(
    screen.getByRole("button", { name: "How are lengths chosen?" }),
  )
  expect(
    within(
      screen.getByRole("dialog", { name: "How are lengths chosen?" }),
    ).getByText(/Estimated total input: 6,263,808 tokens/),
  ).toBeVisible()
  await user.click(limit)
  await user.click(screen.getByRole("option", { name: "Automatic (1023K)" }))
  expect(limit).toHaveTextContent("Automatic (1023K)")
  expect(
    within(
      screen.getByRole("group", {
        name: en.verifyDialog.tools.needle.plannedLengths,
      }),
    ).getByText("1023K"),
  ).toBeVisible()
  await user.click(
    screen.getByRole("button", { name: "How are lengths chosen?" }),
  )
  expect(
    within(
      screen.getByRole("dialog", { name: "How are lengths chosen?" }),
    ).getByText(/Exact lengths:.*1,047,552/),
  ).toBeVisible()
  await user.click(limit)
  await user.click(screen.getByRole("option", { name: "Custom" }))
  expect(
    screen.getByRole("spinbutton", { name: "Custom length (tokens)" }),
  ).toHaveValue(1047552)
  view.rerender(<Harness declaredContext={131072} />)
  await waitFor(() => expect(limit).toHaveTextContent("Automatic (127K)"))
  expect(
    screen.queryByRole("spinbutton", { name: "Custom length (tokens)" }),
  ).not.toBeInTheDocument()
  await user.click(limit)
  expect(screen.getByRole("option", { name: "127K" })).toBeVisible()
  expect(screen.queryByRole("option", { name: "512K" })).not.toBeInTheDocument()
  await user.keyboard("{Escape}")
  expect(runner).not.toHaveBeenCalled()
})

it("preserves custom limit editing when a result moves settings below the matrix", async () => {
  const user = userEvent.setup()
  const i18n = await createResourceTestI18n({ en: { aiApiVerification: en } })
  const counter = {
    encoding: "o200k_base",
    estimated: true,
    declaredInput: 16384,
  }
  function Harness() {
    const controller = useNeedleTest({
      enabled: true,
      blocked: false,
      contextKey: "custom-limit",
      modelId: "test",
      resolveHistoryRequest: async () => null,
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
      runner: async (params) => ({
        version: 1,
        seed: params.seed,
        counter,
        plan: params.approvedPlan!,
        reason: NEEDLE_RUN_REASONS.Complete,
        cells: [],
      }),
    })
    return (
      <NeedlePanel
        controller={controller}
        runCapacity={vi.fn()}
        canRunCapacity={false}
      />
    )
  }
  render(
    <I18nextProvider i18n={i18n}>
      <Harness />
    </I18nextProvider>,
  )
  await screen.findByText("3 requests")
  await user.click(screen.getByRole("combobox"))
  await user.click(
    screen.getByRole("option", { name: en.verifyDialog.tools.needle.custom }),
  )
  const limit = screen.getByRole("spinbutton", {
    name: en.verifyDialog.tools.needle.customLimit,
  })
  // The custom draft equals a preset, so only the editor state distinguishes it.
  expect(limit).toHaveValue(16384)
  await user.click(
    screen.getByRole("button", { name: en.verifyDialog.tools.needle.run }),
  )
  await screen.findByRole("region", { name: "Execution result" })
  expect(
    screen.getByRole("spinbutton", {
      name: en.verifyDialog.tools.needle.customLimit,
    }),
  ).toHaveValue(16384)
  expect(screen.getByRole("combobox")).toHaveTextContent(
    en.verifyDialog.tools.needle.custom,
  )
})
