import type { Locator, Page } from "@playwright/test"

export function waitForNativeKeyEditor(
  page: Page,
  options: { readyField: string | RegExp | Locator; timeoutMs?: number },
): Promise<Locator>

export function openNativeKeyEditor(
  page: Page,
  options: {
    trigger: Locator
    readyField: string | RegExp | Locator
    timeoutMs?: number
  },
): Promise<Locator>

export function submitNativeKeyEditor(
  page: Page,
  options?: { timeoutMs?: number; waitForClose?: boolean },
): Promise<void>
