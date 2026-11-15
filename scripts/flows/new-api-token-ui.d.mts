import type { Locator, Page } from "@playwright/test"

export interface NewApiTokenUiCredentials {
  password: string
  totpSecret?: string
}

export function copyNewApiAccessToken(
  page: Page,
  credentials: NewApiTokenUiCredentials,
  options?: {
    tokenName?: string
    neverExpires?: boolean
    useClipboard?: boolean
    allowLegacyRotation?: boolean
    beforeCreateScopedToken?: () => Promise<unknown>
    onScopedTokenCreated?: () => Promise<unknown> | void
  },
): Promise<string>

export function fillSecret(
  input: Locator,
  value: string,
  label: string,
): Promise<void>

export function revokeNewApiAccessTokenFromUi(
  page: Page,
  config: NewApiTokenUiCredentials & { origin: string; tokenName: string },
): Promise<void>
