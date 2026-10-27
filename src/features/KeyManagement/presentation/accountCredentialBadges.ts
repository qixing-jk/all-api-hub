import type { TFunction } from "i18next"

import {
  ACCOUNT_CREDENTIAL_IDENTITY_STATUSES as statuses,
  type AccountCredentialIdentity,
} from "~/services/accounts/keys/accountCredentialIdentityFacts"

import type { KeyResourceBadge } from "./keyResourceCard"

/** Shared visual vocabulary for every site's account-credential evidence. */
export function buildAccountCredentialBadges(
  identity: AccountCredentialIdentity | undefined,
  manageGranted: boolean,
  t: TFunction,
): KeyResourceBadge[] {
  const confirmed = identity?.status === statuses.Confirmed
  const badges: KeyResourceBadge[] = []
  if (manageGranted)
    badges.push({
      id: "manage-permission",
      label: t(
        confirmed
          ? "keyManagement:native.badges.accountManagePermission"
          : "keyManagement:native.badges.managePermission",
      ),
      variant: "warning",
      title: t(
        confirmed
          ? "keyManagement:native.permission.accountManageBadgeTitle"
          : "keyManagement:native.permission.manageBadgeTitle",
      ),
    })
  if (confirmed && !manageGranted)
    badges.push({
      id: "account-credential",
      label: t("keyManagement:native.badges.accountCredential"),
      variant: "info",
      title: t("keyManagement:native.credentialRole.badgeTitle"),
    })
  if (identity?.status === statuses.Possible)
    badges.push({
      id: "account-credential-candidate",
      label: t("keyManagement:native.badges.accountCredentialCandidate"),
      variant: "outline",
      title: t("keyManagement:native.credentialRole.candidateTitle"),
    })
  return badges
}
