import {
  CHECK_IN_EXECUTION_SKIP_REASONS,
  CHECK_IN_PROVIDER_READINESS_REASONS,
} from "~/constants/checkIn"
import { normalizeAccountSiteProfileUrlForOriginKey } from "~/services/accounts/accountSiteProfile/urls"
import { normalizeAccountIdentity } from "~/services/accounts/identity/accountIdentity"
import { inspectAccountCheckIn } from "~/services/checkin/autoCheckin/discovery/inspection"
import type { AutoCheckinMethodRegistration } from "~/services/checkin/autoCheckin/providers/registry"
import type { SiteAccount } from "~/types"
import type { CheckInExecutionSkipReason } from "~/types/checkIn"

export const toProviderReadinessSkipReason = (
  reason:
    | typeof CHECK_IN_PROVIDER_READINESS_REASONS.AccountDataMissing
    | typeof CHECK_IN_PROVIDER_READINESS_REASONS.CredentialsMissing,
): CheckInExecutionSkipReason =>
  reason === CHECK_IN_PROVIDER_READINESS_REASONS.CredentialsMissing
    ? CHECK_IN_EXECUTION_SKIP_REASONS.CredentialsMissing
    : CHECK_IN_EXECUTION_SKIP_REASONS.AccountDataMissing

const hasSameCheckInAccountIdentity = (
  currentAccount: SiteAccount,
  latestAccount: SiteAccount,
): boolean =>
  latestAccount.id === currentAccount.id &&
  latestAccount.site_type === currentAccount.site_type &&
  normalizeAccountIdentity(latestAccount.account_info?.id) ===
    normalizeAccountIdentity(currentAccount.account_info?.id) &&
  normalizeAccountSiteProfileUrlForOriginKey({
    siteType: latestAccount.site_type,
    url: latestAccount.site_url,
  }) ===
    normalizeAccountSiteProfileUrlForOriginKey({
      siteType: currentAccount.site_type,
      url: currentAccount.site_url,
    })

/** Shared POST policy; callers own account reload and their failure presentation. */
export async function inspectCheckInMutationAdmission(input: {
  expectedAccount: SiteAccount
  account: SiteAccount | null
  registration: AutoCheckinMethodRegistration
  globalAutomaticExecutionEnabled: boolean
  isAutomaticExecutionEnabled?: () => Promise<boolean>
}): Promise<
  | { eligible: true; account: SiteAccount }
  | { eligible: false; reason: CheckInExecutionSkipReason }
> {
  const account = input.account
  if (
    !account ||
    !hasSameCheckInAccountIdentity(input.expectedAccount, account)
  ) {
    return {
      eligible: false,
      reason: CHECK_IN_EXECUTION_SKIP_REASONS.AccountUnavailable,
    }
  }
  const state = inspectAccountCheckIn({
    config: account.checkIn,
    siteType: account.site_type,
    siteUrl: account.site_url,
    accountDisabled: account.disabled,
    globalAutomaticExecutionEnabled: input.globalAutomaticExecutionEnabled,
  })
  if (!state.executionEligibility.eligible) {
    return { eligible: false, reason: state.executionEligibility.skipReason }
  }
  if (state.executionEligibility.methodId !== input.registration.id) {
    return {
      eligible: false,
      reason: CHECK_IN_EXECUTION_SKIP_REASONS.MethodNotMatched,
    }
  }
  const readiness = input.registration.provider.getReadiness(account)
  if (!readiness.ready) {
    return {
      eligible: false,
      reason: toProviderReadinessSkipReason(readiness.reason),
    }
  }
  if (
    input.isAutomaticExecutionEnabled &&
    !(await input.isAutomaticExecutionEnabled())
  ) {
    return {
      eligible: false,
      reason: CHECK_IN_EXECUTION_SKIP_REASONS.GlobalAutomaticExecutionDisabled,
    }
  }
  return { eligible: true, account }
}
