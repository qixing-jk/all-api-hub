/**
 * Test factories for generating safe, non-secret-like values.
 *
 * IMPORTANT:
 * - Do not embed realistic-looking secrets (e.g. `sk-...`) as string literals.
 * - Keep values deterministic to avoid brittle snapshots/expectations.
 */

/**
 * Build a dummy API key used by Web AI API Check tests.
 */
export function buildApiKey(): string {
  return "test-api-key"
}

/**
 * Build a clipboard payload that the content script can extract credentials from.
 */
export function buildApiCheckClipboardText(params?: {
  baseUrl?: string
  apiKey?: string
}): string {
  const baseUrl = params?.baseUrl ?? "https://proxy.example.com/api/v1"
  const apiKey = params?.apiKey ?? buildApiKey()

  return [`Base URL: ${baseUrl}`, `API Key: ${apiKey}`].join("\n")
}
