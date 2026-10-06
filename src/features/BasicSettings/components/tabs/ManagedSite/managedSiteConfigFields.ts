import { isManagedSiteAdminUserIdInputValid } from "~/services/managedSites/utils/adminUserId"

export type ManagedSiteConfigTextPolicy = {
  parse(value: string): string | undefined
  reconcileDraft?: boolean
  compareSaved?(value: string): string
}

const trimText = (value: string) => value.trim()
const userIdPolicy: ManagedSiteConfigTextPolicy = {
  parse: (value) => {
    const trimmed = value.trim()
    return isManagedSiteAdminUserIdInputValid(trimmed) ? trimmed : undefined
  },
  reconcileDraft: true,
}

/** Declared text semantics keep credential normalization specific to its owner. */
export const MANAGED_SITE_CONFIG_TEXT_POLICIES = {
  Raw: { parse: (value: string) => value },
  Trimmed: { parse: trimText },
  TrimmedDraft: { parse: trimText, reconcileDraft: true },
  TrimmedComparison: {
    parse: trimText,
    reconcileDraft: true,
    compareSaved: trimText,
  },
  UserId: userIdPolicy,
  UserIdComparison: { ...userIdPolicy, compareSaved: trimText },
} satisfies Record<string, ManagedSiteConfigTextPolicy>
