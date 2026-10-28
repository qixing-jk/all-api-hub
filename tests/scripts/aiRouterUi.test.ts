import { chromium } from "@playwright/test"
import { expect, it, vi } from "vitest"

// @ts-expect-error Node-only suite does not have declarations.
import { runAiRouterUiTest } from "~~/scripts/suites/ai-router/ui.mjs"

vi.mock("~~/scripts/cdp/sandbox.mjs", () => ({
  withTemporaryAccount: async (
    _worker: unknown,
    account: unknown,
    run: (account: unknown) => Promise<void>,
  ) => run(account),
}))
vi.mock("~~/scripts/flows/account-card.mjs", () => ({
  testAccountCardFlow: async () => ({ ok: true }),
}))
vi.mock("~~/scripts/cdp/ui-driver.mjs", () => ({
  dismissModals: async () => {},
  openExtensionPage: async ({
    context,
  }: {
    context: { newPage: () => unknown }
  }) => context.newPage(),
}))

it.each(["shell", "wrong-source", "selected-source"])(
  "checks the actual model page and account source (%s)",
  async (mode) => {
    const browser = await chromium.launch({ headless: true })
    try {
      const page = await browser.newPage()
      page.setDefaultTimeout(200)
      vi.spyOn(page, "goto").mockImplementation(async () => {
        await page.setContent(
          mode === "shell"
            ? "<main>Model request failed</main>"
            : `<main data-testid="model-list-page" data-model-source="account:${mode === "selected-source" ? "sandbox-temp-ai-router" : "other"}">Models</main>`,
        )
        return null
      })
      const result = runAiRouterUiTest({
        context: { newPage: async () => page },
        extensionId: "fixture",
        serviceWorker: {},
      })
      if (mode === "selected-source")
        await expect(result).resolves.toBeUndefined()
      else await expect(result).rejects.toThrow()
    } finally {
      await browser.close()
      vi.restoreAllMocks()
    }
  },
)
