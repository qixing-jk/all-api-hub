import path from "node:path"
import type { BrowserContextOptions } from "@playwright/test"

type ExtensionLaunchOptions = {
  extensionDir: string
  headless: boolean
  chromeExecutablePath?: string | null
}

type ChromiumPersistentLaunchOptions = BrowserContextOptions & {
  args: string[]
  channel?: "chromium"
  executablePath?: string
  headless: boolean
  ignoreDefaultArgs: string[]
}

type ExtensionContextStartupRetryOptions<
  TContext extends { close(): Promise<void> },
> = {
  launch: (attempt: number) => Promise<TContext>
  waitForReady: (context: TContext, attempt: number) => Promise<void>
  onRetry?: (error: unknown, attempt: number) => void
}

/**
 * Launch an extension context and retry once when only service-worker startup
 * readiness fails. Browser launch errors still fail immediately.
 */
export async function launchExtensionContextWithStartupRetry<
  TContext extends { close(): Promise<void> },
>({
  launch,
  onRetry,
  waitForReady,
}: ExtensionContextStartupRetryOptions<TContext>): Promise<TContext> {
  const maxAttempts = 2

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const context = await launch(attempt)

    try {
      await waitForReady(context, attempt)
      return context
    } catch (startupError) {
      try {
        await context.close()
      } catch (closeError) {
        throw new AggregateError(
          [startupError, closeError],
          "Failed to close an extension context after service-worker startup failed",
        )
      }

      if (attempt === maxAttempts) {
        throw startupError
      }

      onRetry?.(startupError, attempt)
    }
  }

  throw new Error("Extension context startup retry exhausted unexpectedly")
}

/**
 * Build Chromium launch options for MV3 extension E2E.
 *
 * Older Chrome binaries still route Playwright's plain --headless flag through
 * legacy headless, which does not load extensions reliably. Chromium removed
 * legacy headless from the main Chrome binary in 132, matching the observed
 * compat split where 114-122 hang but 144+ pass. Keep extension E2E on the
 * modern headless path explicitly.
 */
export function buildExtensionLaunchOptions({
  extensionDir,
  headless,
  chromeExecutablePath,
}: ExtensionLaunchOptions): ChromiumPersistentLaunchOptions {
  const args = [
    `--disable-extensions-except=${extensionDir}`,
    `--load-extension=${extensionDir}`,
    "--no-default-browser-check",
    "--no-first-run",
  ]

  const ignoreDefaultArgs = ["--disable-extensions"]

  if (headless && chromeExecutablePath) {
    args.push("--headless=new")
    ignoreDefaultArgs.push("--headless")
  }

  return {
    headless,
    args,
    ignoreDefaultArgs,
    ...(chromeExecutablePath
      ? { executablePath: path.resolve(process.cwd(), chromeExecutablePath) }
      : {}),
    ...(headless && !chromeExecutablePath
      ? { channel: "chromium" as const }
      : {}),
  }
}
