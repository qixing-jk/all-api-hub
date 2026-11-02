import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { main as aiRouter } from "~~/scripts/test-ai-router-e2e-live.mjs"
import { main as gptLoad } from "~~/scripts/test-gpt-load-e2e-live.mjs"
import { main as grsai } from "~~/scripts/test-grsai-e2e-live.mjs"
import { main as kimi } from "~~/scripts/test-kimi-e2e-live.mjs"
import { main as omniRoute } from "~~/scripts/test-omniroute-e2e-live.mjs"
import { main as requesty } from "~~/scripts/test-requesty-e2e-live.mjs"
import { main as rix } from "~~/scripts/test-rix-api-e2e-live.mjs"

const mocks = vi.hoisted(() => ({
  probe: vi.fn(),
  ui: vi.fn(),
  connect: vi.fn(),
  close: vi.fn(),
}))
vi.mock("~~/scripts/cdp/client.mjs", () => ({
  connectDevExtension: mocks.connect,
  connectExtensionById: mocks.connect,
  defaultCdpUrl: () => "http://localhost:9337",
}))
vi.mock("~~/scripts/suites/ai-router/probe.mjs", () => ({
  runAiRouterProbe: mocks.probe,
}))
vi.mock("~~/scripts/suites/ai-router/ui.mjs", () => ({
  runAiRouterUiTest: mocks.ui,
}))
vi.mock("~~/scripts/suites/rix/probe.mjs", () => ({ runRixProbe: mocks.probe }))
vi.mock("~~/scripts/suites/rix/ui.mjs", () => ({ runRixUiTest: mocks.ui }))
vi.mock("~~/scripts/suites/grsai/probe.mjs", () => ({
  runGrsaiProbe: mocks.probe,
}))
vi.mock("~~/scripts/suites/grsai/ui.mjs", () => ({ runGrsaiUiTest: mocks.ui }))
vi.mock("~~/scripts/suites/requesty/probe.mjs", () => ({
  runRequestyProbe: mocks.probe,
}))
vi.mock("~~/scripts/suites/requesty/ui.mjs", () => ({
  runRequestyUiTest: mocks.ui,
}))
vi.mock("~~/scripts/suites/kimi/probe.mjs", () => ({
  runKimiProbe: mocks.probe,
}))
vi.mock("~~/scripts/suites/kimi/ui.mjs", () => ({ runKimiUiTest: mocks.ui }))
vi.mock("~~/scripts/suites/gpt-load/probe.mjs", () => ({
  runGptLoadProbe: mocks.probe,
}))
vi.mock("~~/scripts/suites/gpt-load/ui.mjs", () => ({
  runGptLoadUiTest: mocks.ui,
}))
vi.mock("~~/scripts/suites/omniroute/probe.mjs", () => ({
  runOmniRouteProbe: mocks.probe,
}))
vi.mock("~~/scripts/suites/omniroute/ui.mjs", () => ({
  runOmniRouteUiTest: mocks.ui,
}))

const runners = [
  { name: "AI-Router", main: aiRouter, args: ["--token=test-session"] },
  { name: "Rix", main: rix, args: [] },
  { name: "Grsai", main: grsai, args: ["--token=test-session"] },
  { name: "Requesty", main: requesty, args: ["--key=test-key"] },
  { name: "Kimi", main: kimi, args: ["--token=test-session"] },
  {
    name: "gpt-load",
    main: gptLoad,
    args: ["--base-url=https://test.invalid", "--key=test-key"],
  },
  {
    name: "OmniRoute",
    main: omniRoute,
    args: ["--base-url=https://test.invalid", "--token=test-session"],
  },
]
beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, "log").mockImplementation(() => {})
  mocks.connect.mockResolvedValue({
    close: mocks.close,
    extensionId: "test-extension",
  })
  mocks.probe.mockResolvedValue({ ok: true })
})
afterEach(() => {
  vi.restoreAllMocks()
  process.exitCode = 0
})

it.each(runners)(
  "$name rejects unknown selection before protocol or browser access",
  async ({ main, args }) => {
    await expect(main([...args, "--suite=typo"])).rejects.toThrow()
    expect(mocks.probe).not.toHaveBeenCalled()
    expect(mocks.connect).not.toHaveBeenCalled()
  },
)

it.each(runners)(
  "$name retains a failed protocol result and still runs independent UI",
  async ({ main, args }) => {
    mocks.probe.mockResolvedValue({ ok: false })
    await expect(main([...args, "--suite=all"])).rejects.toThrow(/probe/)
    expect(mocks.ui).toHaveBeenCalledOnce()
    expect(mocks.close).toHaveBeenCalledOnce()
  },
)

it.each(runners)(
  "$name dispatches all suites and limits an explicit UI selection",
  async ({ main, args }) => {
    await main([...args, "--suite=all"])
    expect(mocks.probe).toHaveBeenCalledOnce()
    expect(mocks.ui).toHaveBeenCalledOnce()
    vi.clearAllMocks()
    await main([...args, "--suite=ui"])
    expect(mocks.probe).not.toHaveBeenCalled()
    expect(mocks.ui).toHaveBeenCalledOnce()
  },
)

it.each(runners)(
  "$name retains both the UI failure and a connection cleanup failure",
  async ({ main, args }) => {
    mocks.ui.mockRejectedValue(new Error("UI assertion failed"))
    mocks.close.mockRejectedValue(new Error("detach failed"))
    await expect(main([...args, "--suite=ui"])).rejects.toThrow(
      /UI assertion failed.*detach failed/,
    )
  },
)

it.each([runners[2]!, runners[3]!])(
  "$name rejects a skipped protocol result",
  async ({ main, args }) => {
    mocks.probe.mockResolvedValue({ ok: true, skipped: true })
    await expect(main([...args, "--suite=probe"])).rejects.toThrow(/blocked/)
  },
)

it.each([runners[0]!, runners[2]!])(
  "$name cannot count credentialless fixture UI as full live acceptance",
  async ({ main }) => {
    await expect(main(["--suite=ui", "--token="])).rejects.toThrow(/blocked/)
  },
)
