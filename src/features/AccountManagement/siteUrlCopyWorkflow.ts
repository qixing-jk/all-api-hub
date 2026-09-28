import type { DisplaySiteData } from "~/types"

export const SITE_URL_COPY_RESULTS = {
  Success: "success",
  ClipboardFailure: "clipboard_failure",
} as const

type SiteUrlCopyResult =
  (typeof SITE_URL_COPY_RESULTS)[keyof typeof SITE_URL_COPY_RESULTS]

interface RunSiteUrlCopyWorkflowOptions {
  accounts: DisplaySiteData[]
}

interface SiteUrlCopyWorkflowResult {
  result: SiteUrlCopyResult
  payload: string
  selectedCount: number
  itemCount: number
  successCount: number
  failureCount: number
  skippedCount: number
}

/**
 * Copies the stored site address of every selected account.
 *
 * Disabled accounts keep their address, so they are copied too even though the
 * invite-link workflow has to skip them, and blank addresses are dropped
 * instead of pasting empty lines.
 */
export async function runSiteUrlCopyWorkflow({
  accounts,
}: RunSiteUrlCopyWorkflowOptions): Promise<SiteUrlCopyWorkflowResult> {
  const siteUrls = accounts
    .map((account) => account.baseUrl?.trim() ?? "")
    .filter((siteUrl) => siteUrl.length > 0)
  const payload = siteUrls.join("\n")
  const baseResult = {
    payload,
    selectedCount: accounts.length,
    itemCount: siteUrls.length,
    skippedCount: accounts.length - siteUrls.length,
  }

  try {
    await navigator.clipboard.writeText(payload)
  } catch {
    return {
      ...baseResult,
      result: SITE_URL_COPY_RESULTS.ClipboardFailure,
      successCount: 0,
      failureCount: siteUrls.length,
    }
  }

  return {
    ...baseResult,
    result: SITE_URL_COPY_RESULTS.Success,
    successCount: siteUrls.length,
    failureCount: 0,
  }
}
