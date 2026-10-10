import type { Locator, Page } from "@playwright/test"

import type { RealSiteUpstream } from "../../utils/real-site-upstream.mjs"
import type { MagpieNativeClient, MagpieTestConfig } from "./native.mjs"

export function runMagpieUiScenario(options: {
  page: Page
  extensionId: string
  native: MagpieNativeClient
  config: MagpieTestConfig
  upstream: RealSiteUpstream | null
  scenario: "management" | "imports" | "model-sync" | "key-pool"
  onCheck?: (name: string) => void
  onCapture?: (name: string, target: Locator) => Promise<void>
}): Promise<string[]>
