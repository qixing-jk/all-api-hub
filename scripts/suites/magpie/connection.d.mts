import type { Page } from "@playwright/test"

export function validateMagpieWebKey(
  page: Page,
  webKey: string,
  message: string,
): Promise<void>
