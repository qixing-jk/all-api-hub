import type { TFunction } from "i18next"
import { useTranslation } from "react-i18next"

import { CredentialAssociationMenu } from "~/components/CredentialAssociationMenu"
import { ACCOUNT_RUNTIME_KEY_SOURCES } from "~/services/accounts/accountRuntimeKeys"
import { ACCOUNT_DISPLAY_NAME_SEPARATOR } from "~/services/accounts/utils/accountDisplayName"
import { API_CREDENTIAL_PROFILE_LINK_STATES } from "~/types/apiCredentialProfiles"

import type {
  ApiCredentialProfileAssociatedKeyItem,
  ApiCredentialProfileAssociatedKeyState,
  ApiCredentialProfileAssociationAvailability,
} from "../contracts"
import {
  API_CREDENTIAL_PROFILE_ASSOCIATION_AVAILABILITY_STATUSES,
  API_CREDENTIAL_PROFILE_ASSOCIATION_STATUSES,
} from "../contracts"
import { API_CREDENTIAL_PROFILES_TEST_IDS } from "../testIds"

type ApiCredentialProfileKeyAssociationsProps = {
  availability: ApiCredentialProfileAssociationAvailability
  state?: ApiCredentialProfileAssociatedKeyState
  onOpenAssociatedKey?: (associationId: string) => void
  onConfirmAssociatedKey?: (associationId: string) => void
  onUnlinkAssociatedKey?: (associationId: string) => void
}

const getAssociatedKeyLabel = (
  item: ApiCredentialProfileAssociatedKeyItem,
  t: TFunction,
): string => {
  const { locator } = item
  let resourceLabel: string

  switch (locator.source) {
    case ACCOUNT_RUNTIME_KEY_SOURCES.AccountToken:
      resourceLabel = t("apiCredentialProfiles:association.accountToken", {
        id: locator.tokenId,
      })
      break
    case ACCOUNT_RUNTIME_KEY_SOURCES.AccountKeyResource:
      resourceLabel = t("apiCredentialProfiles:association.keyResource", {
        id: locator.ref.resourceId,
      })
      break
    case ACCOUNT_RUNTIME_KEY_SOURCES.ServiceCredential:
      resourceLabel = t("apiCredentialProfiles:association.serviceCredential", {
        service: locator.service,
      })
      break
  }

  return item.accountName
    ? `${item.accountName}${ACCOUNT_DISPLAY_NAME_SEPARATOR}${resourceLabel}`
    : resourceLabel
}

/** Adapts API credential associations to the shared compact action menu. */
export function ApiCredentialProfileKeyAssociations({
  availability,
  state,
  onOpenAssociatedKey,
  onConfirmAssociatedKey,
  onUnlinkAssociatedKey,
}: ApiCredentialProfileKeyAssociationsProps) {
  const { t } = useTranslation(["apiCredentialProfiles"])

  if (
    availability.status ===
      API_CREDENTIAL_PROFILE_ASSOCIATION_AVAILABILITY_STATUSES.Unknown ||
    !state ||
    state.items.length === 0
  ) {
    return null
  }

  const isNeedsConfirmation =
    state.status ===
    API_CREDENTIAL_PROFILE_ASSOCIATION_STATUSES.NeedsConfirmation
  const statusLabel = isNeedsConfirmation
    ? t("apiCredentialProfiles:association.needsConfirmation")
    : t("apiCredentialProfiles:association.linked")
  const hasCount = isNeedsConfirmation || state.items.length > 1
  const items = state.items.map((item) => ({
    id: item.associationId,
    label: state.items.length > 1 ? getAssociatedKeyLabel(item, t) : undefined,
    onOpen: onOpenAssociatedKey
      ? () => onOpenAssociatedKey(item.associationId)
      : undefined,
    onConfirm:
      item.state === API_CREDENTIAL_PROFILE_LINK_STATES.NeedsConfirmation &&
      onConfirmAssociatedKey
        ? () => onConfirmAssociatedKey(item.associationId)
        : undefined,
    onUnlink: onUnlinkAssociatedKey
      ? () => onUnlinkAssociatedKey(item.associationId)
      : undefined,
  }))

  return (
    <CredentialAssociationMenu
      status={state.status}
      items={items}
      labels={{
        open: t("apiCredentialProfiles:association.viewKey"),
        confirm: t("apiCredentialProfiles:association.confirmLink"),
        unlink: t("apiCredentialProfiles:association.removeLink"),
      }}
      testId={API_CREDENTIAL_PROFILES_TEST_IDS.associationButton}
      triggerAriaLabel={
        hasCount ? `${statusLabel}: ${state.items.length}` : statusLabel
      }
      count={hasCount ? state.items.length : undefined}
    />
  )
}

export type { ApiCredentialProfileKeyAssociationsProps }
