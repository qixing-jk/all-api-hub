import path from "node:path"
import { test as base, expect } from "@playwright/test"

const test = base.extend({
  launchOptions: [
    async ({ launchOptions }, use) => {
      await use({
        ...launchOptions,
        args: [...(launchOptions.args ?? []), "--enable-automation"],
      })
    },
    { scope: "worker" },
  ],
})

test("ordinary browser fixtures respect the requested launch mode and Chrome executable", async ({
  browser,
  headless,
}) => {
  const session = await browser.newBrowserCDPSession()
  try {
    const { arguments: args } = await session.send(
      "Browser.getBrowserCommandLine",
    )
    expect(
      args.some((argument: string) => argument.startsWith("--headless")),
    ).toBe(headless)
    if (process.env.AAH_E2E_CHROME_EXECUTABLE_PATH) {
      expect(args[0]).toBe(
        path.resolve(process.env.AAH_E2E_CHROME_EXECUTABLE_PATH),
      )
    }
  } finally {
    await session.detach()
  }
})
