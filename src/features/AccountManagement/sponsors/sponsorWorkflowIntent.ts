import { normalizeSponsorAddAccountPrefill } from "~/features/AccountManagement/sponsors/addAccountPrefill"
import { SPONSOR_WORKFLOW_KINDS } from "~/features/AccountManagement/sponsors/constants"
import type {
  AddAccountPrefill,
  SponsorApiCredentialFallbackPrefill,
  SponsorBookmarkFallbackPrefill,
} from "~/features/AccountManagement/sponsors/types"
import {
  SPONSOR_WORKFLOW_STORAGE_KEYS,
  STORAGE_LOCKS,
} from "~/services/core/storageKeys"
import { createUiHandoffChannel } from "~/services/uiHandoff"
import { isRecord } from "~/utils/core/object"
import { isHttpUrl } from "~/utils/core/urlParsing"

export type SponsorWorkflowVisit = () => void | Promise<
  browser.tabs.Tab | undefined
>
export type SponsorWorkflowStarter = (
  intent: SponsorWorkflowIntent,
  visit: SponsorWorkflowVisit,
) => Promise<void>

export type SponsorWorkflowIntent =
  | { kind: typeof SPONSOR_WORKFLOW_KINDS.Account; prefill: AddAccountPrefill }
  | {
      kind: typeof SPONSOR_WORKFLOW_KINDS.Bookmark
      prefill: SponsorBookmarkFallbackPrefill
    }
  | {
      kind: typeof SPONSOR_WORKFLOW_KINDS.ApiCredential
      prefill: SponsorApiCredentialFallbackPrefill
    }

/** Validates short-lived creation hints received from another extension surface. */
function normalize(value: unknown): SponsorWorkflowIntent | null {
  if (!isRecord(value) || !isRecord(value.prefill)) return null
  const prefill = value.prefill
  if (value.kind === SPONSOR_WORKFLOW_KINDS.Account) {
    const account = normalizeSponsorAddAccountPrefill(prefill)
    return account
      ? { kind: SPONSOR_WORKFLOW_KINDS.Account, prefill: account }
      : null
  }
  if (typeof prefill.name !== "string") return null
  if (
    value.kind === SPONSOR_WORKFLOW_KINDS.Bookmark &&
    typeof prefill.url === "string" &&
    isHttpUrl(prefill.url)
  ) {
    return {
      kind: SPONSOR_WORKFLOW_KINDS.Bookmark,
      prefill: { name: prefill.name, url: prefill.url },
    }
  }
  if (
    value.kind === SPONSOR_WORKFLOW_KINDS.ApiCredential &&
    typeof prefill.baseUrl === "string" &&
    isHttpUrl(prefill.baseUrl)
  ) {
    return {
      kind: SPONSOR_WORKFLOW_KINDS.ApiCredential,
      prefill: {
        name: prefill.name,
        baseUrl: prefill.baseUrl,
        ...(typeof prefill.apiKeyCreateUrl === "string" &&
        isHttpUrl(prefill.apiKeyCreateUrl)
          ? { apiKeyCreateUrl: prefill.apiKeyCreateUrl }
          : {}),
        ...(typeof prefill.apiKeyCreateHint === "string"
          ? { apiKeyCreateHint: prefill.apiKeyCreateHint }
          : {}),
      },
    }
  }
  return null
}

/** Uses the same session-only, window-scoped protocol as account draft recovery. */
export const sponsorWorkflowChannel = createUiHandoffChannel({
  draftPrefix: SPONSOR_WORKFLOW_STORAGE_KEYS.DRAFT_PREFIX,
  pendingPrefix: SPONSOR_WORKFLOW_STORAGE_KEYS.PENDING_PREFIX,
  lockName: STORAGE_LOCKS.SPONSOR_WORKFLOW,
  ttlMs: 5 * 60 * 1000,
  normalize,
})
