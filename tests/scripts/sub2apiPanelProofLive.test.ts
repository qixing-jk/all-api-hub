import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { runBrowserSessionAcceptance } from "~~/scripts/suites/sub2api/browser-session.mjs"
import { main } from "~~/scripts/test-sub2api-panel-proof-live.mjs"

const mocks = vi.hoisted(() => ({
  readFile: vi.fn(),
  mkdir: vi.fn(),
  writeFile: vi.fn(),
  connect: vi.fn(),
  newPage: vi.fn(),
  close: vi.fn(),
  pageClose: vi.fn(),
  evaluate: vi.fn(),
  detectionOutcome: vi.fn(),
  requestListener: undefined as undefined | ((request: unknown) => void),
  unsignedEndpoint: undefined as string | undefined,
}))
vi.mock("node:fs/promises", () => ({
  default: {
    readFile: mocks.readFile,
    mkdir: mocks.mkdir,
    writeFile: mocks.writeFile,
  },
}))
vi.mock("~~/scripts/cdp/client.mjs", () => ({
  connectWorktreeExtension: mocks.connect,
}))
vi.mock("~~/scripts/cdp/dev-profile.mjs", () => ({ applyIsolateFlag: vi.fn() }))
vi.mock("~~/scripts/flows/auto-detect.mjs", () => ({
  openAccountAddDialog: vi.fn(),
  detectAccountSiteType: vi.fn(),
  assertAccountDetectionOutcome: mocks.detectionOutcome,
}))
vi.mock("@playwright/test", async () => {
  const { expect: assertResult } = await import("vitest")
  return {
    expect: Object.assign(
      () => ({ not: { toBeEmpty: vi.fn() }, toBeChecked: vi.fn() }),
      {
        poll: (read: () => Promise<unknown>) => ({
          toBe: async (expected: unknown) =>
            assertResult(await read()).toBe(expected),
        }),
      },
    ),
  }
})

const args = ["--login", "--expected-id=17"]
const target = "https://fixture.example"
const credential = {
  accessToken: "private-access-fixture",
  sub2apiAuth: {
    refreshToken: "private-refresh-fixture",
    tokenExpiresAt: 2000000000000,
  },
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.requestListener = undefined
  mocks.unsignedEndpoint = undefined
  vi.spyOn(console, "log").mockImplementation(() => {})
  vi.stubEnv("AAH_PANEL_PROOF_TEST_BASE_URL", target)
  vi.stubEnv("AAH_PANEL_PROOF_TEST_USERNAME", "fixture-user")
  vi.stubEnv("AAH_PANEL_PROOF_TEST_PASSWORD", "private-password-fixture")
  mocks.readFile.mockImplementation(async (file: string) =>
    file.endsWith("options.html") ? "http://localhost:3000" : "fixture-source",
  )
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          `//# sourceMappingURL=data:application/json;base64,${Buffer.from(JSON.stringify({ sourcesContent: ["fixture-source"] })).toString("base64")}`,
        ),
    ),
  )
  const page = {
    on: vi.fn((event, listener) => {
      if (event === "request") mocks.requestListener = listener
    }),
    goto: vi.fn(),
    reload: vi.fn(),
    locator: vi.fn(),
    evaluate: mocks.evaluate,
    close: mocks.pageClose,
  }
  mocks.newPage.mockResolvedValue(page)
  mocks.pageClose.mockResolvedValue(undefined)
  mocks.close.mockResolvedValue(undefined)
  mocks.connect.mockResolvedValue({
    extensionId: "fixture",
    context: { newPage: mocks.newPage },
    browser: { contexts: () => [] },
    close: mocks.close,
  })
  mocks.evaluate.mockImplementation(async (fn, params) => {
    if (params.username)
      return { status: "authenticated", identity: "17", credential }
    const code = String(fn)
    const endpoint =
      params.endpoint ??
      (code.includes("refreshSub2ApiTokens")
        ? "/api/v1/auth/refresh"
        : code.includes("auth/logout")
          ? "/api/v1/auth/logout"
          : "/api/v1/auth/me")
    mocks.requestListener?.({
      url: () => target + endpoint,
      headers: () =>
        endpoint === mocks.unsignedEndpoint
          ? {}
          : { "x-panel-proof": "private-proof-fixture" },
    })
    if (code.includes("refreshSub2ApiTokens"))
      return {
        accessToken: "private-renewed-access",
        refreshToken: "private-renewed-refresh",
        tokenExpiresAt: 2000000000000,
      }
    return { status: 200, code: 0, identity: 17, id: 17 }
  })
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

function mockBrowserSession(accounts: unknown[]) {
  vi.stubGlobal("browser", {
    storage: {
      local: {
        get: vi.fn().mockResolvedValue({ site_accounts: { accounts } }),
      },
    },
  })
  const button = { or: vi.fn(), first: vi.fn(), waitFor: vi.fn() }
  button.or.mockReturnValue(button)
  button.first.mockReturnValue(button)
  const page = {
    emulateMedia: vi.fn(),
    bringToFront: vi.fn(),
    goto: vi.fn(),
    getByTestId: vi.fn().mockReturnValue(button),
    evaluate: vi.fn((fn, params) => fn(params)),
    screenshot: vi.fn().mockResolvedValue(undefined),
    close: mocks.pageClose,
  }
  const site = {
    goto: vi.fn(),
    evaluate: vi
      .fn()
      .mockResolvedValueOnce(17)
      .mockResolvedValueOnce("fixture-user"),
    waitForFunction: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  }
  mocks.newPage.mockResolvedValueOnce(page).mockResolvedValueOnce(site)
  mocks.connect.mockResolvedValue({
    extensionId: "fixture",
    context: { newPage: mocks.newPage, on: vi.fn(), off: vi.fn() },
    close: mocks.close,
  })
  return { page, site }
}

describe("signed session live acceptance runner", () => {
  it.each([target, `${target}/`, `${target}/dashboard?tab=account#profile`])(
    "preserves an existing account when the configured target is %s",
    async (configuredTarget) => {
      vi.stubEnv("AAH_PANEL_PROOF_TEST_BASE_URL", configuredTarget)
      const storedAccount = {
        id: "existing",
        site_url: target,
        account_info: { id: 17 },
      }
      const { page, site } = mockBrowserSession([storedAccount])

      await expect(runBrowserSessionAcceptance(args)).rejects.toThrow(
        "This profile already contains the target account",
      )
      expect(site.goto).toHaveBeenCalledWith(
        `${target}/login`,
        expect.any(Object),
      )
      expect(page.evaluate).toHaveBeenCalledWith(expect.any(Function), {
        target,
        expectedId: "17",
      })
      expect(JSON.parse(mocks.writeFile.mock.calls[0]![1])).toMatchObject({
        target,
        cleanup:
          "no owned extension account created; website login retained in dedicated profile",
      })
      expect(mocks.close).toHaveBeenCalledOnce()
    },
  )

  it("reports uncertain cleanup when a submitted account cannot be found", async () => {
    mockBrowserSession([])
    const click = vi.fn()
    mocks.detectionOutcome.mockResolvedValue({
      getByTestId: vi.fn().mockReturnValue({ getByRole: vi.fn(), click }),
      screenshot: vi.fn(),
      waitFor: vi.fn(),
    })
    await expect(runBrowserSessionAcceptance(args)).rejects.toThrow(
      "Owned account cleanup failed",
    )
    expect(click).toHaveBeenCalledOnce()
    expect(JSON.parse(mocks.writeFile.mock.calls[0]![1])).toMatchObject({
      cleanup: "failed: submitted account could not be identified for cleanup",
    })
    expect(mocks.close).toHaveBeenCalledOnce()
  })

  it("requires an explicit target even when the browser-session helper is invoked directly", async () => {
    vi.stubEnv("AAH_PANEL_PROOF_TEST_BASE_URL", undefined)
    await expect(runBrowserSessionAcceptance(args)).rejects.toThrow(
      "AAH_PANEL_PROOF_TEST_BASE_URL",
    )
    expect(mocks.mkdir).not.toHaveBeenCalled()
    expect(mocks.connect).not.toHaveBeenCalled()
  })
  it.each([
    "/api/v1/auth/me",
    "/api/v1/keys?page=1&page_size=1",
    "/api/v1/auth/refresh",
  ])("rejects unsigned acceptance at %s", async (endpoint) => {
    mocks.unsignedEndpoint = endpoint
    await expect(main(args)).rejects.toThrow(/panel proof/i)
    expect(mocks.close).toHaveBeenCalledOnce()
  })
  it("accepts signed reads and renewal while recording only safe diagnostics", async () => {
    await expect(main(args)).resolves.toBeUndefined()
    expect(mocks.writeFile).toHaveBeenCalledOnce()
    expect(mocks.writeFile.mock.calls[0]?.[1]).not.toContain("private-")
  })
  it("rejects a missing identity before rotating the captured session", async () => {
    const execute = mocks.evaluate.getMockImplementation()!
    mocks.evaluate.mockImplementation(async (fn, params) => {
      const result = await execute(fn, params)
      return params.endpoint === "/api/v1/auth/me"
        ? { ...result, identity: undefined }
        : result
    })
    await expect(main(args)).rejects.toThrow()
    expect(
      mocks.evaluate.mock.calls.some(([fn]) =>
        String(fn).includes("refreshSub2ApiTokens"),
      ),
    ).toBe(false)
  })
  it("writes only allowlisted diagnostics even when session revocation fails", async () => {
    const execute = mocks.evaluate.getMockImplementation()!
    mocks.evaluate.mockImplementation(async (fn, params) => {
      if (String(fn).includes("auth/logout")) throw new Error("Cleanup failed")
      return execute(fn, params)
    })
    await expect(main(args)).rejects.toThrow("Own login family cleanup failed")
    expect(mocks.writeFile).toHaveBeenCalledOnce()
    const [file, content] = mocks.writeFile.mock.calls[0]!
    expect(file).not.toContain(".private.")
    expect(content).not.toContain("private-")
    expect(JSON.parse(content)).toMatchObject({
      login: "authenticated",
      cleanup: "failed",
    })
    expect(mocks.pageClose).toHaveBeenCalledOnce()
    expect(mocks.close).toHaveBeenCalledOnce()
  })
  it("releases both the page and CDP when an artifact cannot be written", async () => {
    mocks.writeFile.mockRejectedValue(new Error("Artifact write failed"))
    mocks.pageClose.mockRejectedValue(new Error("Page close failed"))
    await expect(main(args)).rejects.toThrow("Artifact write failed")
    expect(mocks.pageClose).toHaveBeenCalledOnce()
    expect(mocks.close).toHaveBeenCalledOnce()
  })
  it("releases CDP when page setup fails", async () => {
    mocks.newPage.mockRejectedValue(new Error("Page setup failed"))
    await expect(main(args)).rejects.toThrow("Page setup failed")
    expect(mocks.close).toHaveBeenCalledOnce()
  })
  it("requires an explicit credential destination before touching files or browsers", async () => {
    vi.stubEnv("AAH_PANEL_PROOF_TEST_BASE_URL", undefined)
    await expect(main(args)).rejects.toThrow("AAH_PANEL_PROOF_TEST_BASE_URL")
    expect(mocks.readFile).not.toHaveBeenCalled()
    expect(mocks.connect).not.toHaveBeenCalled()
  })
})
