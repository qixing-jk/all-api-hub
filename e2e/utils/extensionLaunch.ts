import path from "node:path"
import { errors, type BrowserContextOptions } from "@playwright/test"

type ExtensionLaunchOptions = {
  extensionDir: string
  headless: boolean
  chromeExecutablePath?: string | null
}

/** Resolve the explicit compatibility browser consistently for all fixtures. */
export function resolveChromeExecutablePath(
  chromeExecutablePath?: string | null,
) {
  return chromeExecutablePath
    ? path.resolve(process.cwd(), chromeExecutablePath)
    : undefined
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
  /** Disable when launch attempts reuse a profile whose process is unobservable. */
  retryLaunchTimeouts?: boolean
  onReadinessFailure?: (error: unknown, attempt: number) => void
  onRetry?: (error: unknown, attempt: number) => void
}

/**
 * Retry once after a browser launch timeout or failed service-worker readiness.
 * Other launch errors fail immediately. Playwright starts cleanup of a timed-out
 * launch asynchronously; callers reusing its profile must disable launch retries.
 * Returned contexts are closed here before retrying readiness failures.
 */
export async function launchExtensionContextWithStartupRetry<
  TContext extends { close(): Promise<void> },
>({
  launch,
  onReadinessFailure,
  onRetry,
  waitForReady,
  retryLaunchTimeouts = true,
}: ExtensionContextStartupRetryOptions<TContext>): Promise<TContext> {
  const maxAttempts = 2

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let context: TContext
    try {
      context = await launch(attempt)
    } catch (launchError) {
      if (
        !retryLaunchTimeouts ||
        !(launchError instanceof errors.TimeoutError) ||
        attempt === maxAttempts
      ) {
        throw launchError
      }
      onRetry?.(launchError, attempt)
      continue
    }

    try {
      await waitForReady(context, attempt)
      return context
    } catch (startupError) {
      // Report before cleanup, which can outlive the enclosing test timeout.
      onReadinessFailure?.(startupError, attempt)
      try {
        await context.close()
      } catch (closeError) {
        throw new AggregateError(
          [startupError, closeError],
          "Failed to close an extension context after service-worker startup failed",
          { cause: closeError },
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
      ? { executablePath: resolveChromeExecutablePath(chromeExecutablePath) }
      : {}),
    ...(headless && !chromeExecutablePath
      ? { channel: "chromium" as const }
      : {}),
  }
}
