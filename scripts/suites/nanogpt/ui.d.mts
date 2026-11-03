import type { DevExtensionConnection } from "../../cdp/client.mjs"
import type { NanoGptRunnerOptions } from "../../test-nanogpt-e2e-live.mjs"

export type NanoGptUiOptions = NanoGptRunnerOptions & DevExtensionConnection
export type NanoGptUiResult = { ok: true } | { skipped: true; reason: string }
export function runNanoGptCurrentTabDetection(
  options: NanoGptUiOptions,
): Promise<NanoGptUiResult>
export function runNanoGptCatalog(
  options: NanoGptUiOptions,
): Promise<NanoGptUiResult>
export function runNanoGptDetection(
  options: NanoGptUiOptions,
): Promise<NanoGptUiResult>
export function runNanoGptOnboarding(
  options: NanoGptUiOptions,
): Promise<NanoGptUiResult>
