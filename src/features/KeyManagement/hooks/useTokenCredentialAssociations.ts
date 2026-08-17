import { useCallback, useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"

import type { KeyResourceCredentialAssociation } from "~/features/KeyManagement/components/KeyResourceCard"
import {
  getAccountRuntimeKeyLocatorIdentity,
  type AccountRuntimeKeyLocator,
} from "~/services/accounts/accountRuntimeKeys"
import type { ApiCredentialProfileLink } from "~/types/apiCredentialProfiles"
import { openApiCredentialProfilesPage } from "~/utils/navigation"

import {
  KEY_MANAGEMENT_ASSOCIATION_TARGET_STATES,
  type KeyManagementAssociationTargetResultState,
} from "../constants"
import {
  getCredentialAssociationForLocator,
  KEY_CREDENTIAL_ASSOCIATION_STATES,
} from "../credentialAssociations"
import { getKeyManagementAssociationTargetId } from "../testIds"
import type {
  KeyManagementDisplayRow,
  KeyManagementEntry,
  NativeKeyManagementRow,
} from "../types"
import {
  isAccountKeyResourceLocatorMatch,
  isAccountRuntimeKeyLocatorMatch,
} from "../utils"

interface UseTokenCredentialAssociationsParams {
  associationTarget?: ApiCredentialProfileLink | null
  canAssociateExistingCredential: boolean
  canManageCredentialAssociations: boolean
  credentialProfileLinks: readonly ApiCredentialProfileLink[]
  filteredDisplayRows: readonly KeyManagementDisplayRow[]
  isLoading: boolean
  nativeLoading: boolean
  onAssociateAssociation?: (
    locator: AccountRuntimeKeyLocator,
    displayLabel?: string,
    targetSecret?: string,
  ) => void
  onAssociationTargetStatusChange?: (
    status: KeyManagementAssociationTargetResultState,
  ) => void
  onUnlinkAssociation?: (associationId: string) => void | Promise<void>
}

/** Adapts durable links to token-row actions and targeted navigation state. */
export function useTokenCredentialAssociations({
  associationTarget,
  canAssociateExistingCredential,
  canManageCredentialAssociations,
  credentialProfileLinks,
  filteredDisplayRows,
  isLoading,
  nativeLoading,
  onAssociateAssociation,
  onAssociationTargetStatusChange,
  onUnlinkAssociation,
}: UseTokenCredentialAssociationsParams) {
  const { t } = useTranslation(["apiCredentialProfiles", "keyManagement"])
  const focusedAssociationSignatureRef = useRef<string | null>(null)
  const associationTargetSignature = associationTarget
    ? `${associationTarget.id}:${getAccountRuntimeKeyLocatorIdentity(
        associationTarget.locator,
      )}`
    : null

  const getAssociationPresentation = useCallback(
    (
      locator: AccountRuntimeKeyLocator,
      displayLabel?: string,
      targetSecret?: string,
    ): KeyResourceCredentialAssociation | undefined => {
      const association = getCredentialAssociationForLocator(
        credentialProfileLinks,
        locator,
      )
      const canAssociateExisting =
        canManageCredentialAssociations &&
        canAssociateExistingCredential &&
        Boolean(onAssociateAssociation)

      if (association.status === KEY_CREDENTIAL_ASSOCIATION_STATES.Unlinked) {
        if (!canAssociateExisting) return undefined

        return {
          status: KEY_CREDENTIAL_ASSOCIATION_STATES.Unlinked,
          label: t("apiCredentialProfiles:association.notLinked"),
          actionLabel: t("apiCredentialProfiles:association.linkExisting"),
          associateLabel: t("apiCredentialProfiles:association.linkExisting"),
          onAssociate: () =>
            onAssociateAssociation?.(locator, displayLabel, targetSecret),
        }
      }

      if (
        association.status ===
        KEY_CREDENTIAL_ASSOCIATION_STATES.NeedsConfirmation
      ) {
        return {
          status: KEY_CREDENTIAL_ASSOCIATION_STATES.NeedsConfirmation,
          label: t("keyManagement:credentialAssociation.needsConfirmation"),
          actionLabel: t(
            "keyManagement:credentialAssociation.reviewCredential",
          ),
          onOpen: () => {
            void openApiCredentialProfilesPage()
          },
          associateLabel: t("apiCredentialProfiles:association.linkExisting"),
          onAssociate: canAssociateExisting
            ? () =>
                onAssociateAssociation?.(locator, displayLabel, targetSecret)
            : undefined,
        }
      }

      return {
        status: KEY_CREDENTIAL_ASSOCIATION_STATES.Linked,
        label: t("keyManagement:credentialAssociation.linked"),
        actionLabel: t("keyManagement:credentialAssociation.viewCredential"),
        onOpen: () => {
          void openApiCredentialProfilesPage({
            profileId: association.profileId,
          })
        },
        associateLabel: t("apiCredentialProfiles:association.linkExisting"),
        onAssociate: canAssociateExisting
          ? () => onAssociateAssociation?.(locator, displayLabel, targetSecret)
          : undefined,
        onUnlink: onUnlinkAssociation
          ? () => {
              void onUnlinkAssociation(association.associationId)
            }
          : undefined,
        unlinkLabel: t("apiCredentialProfiles:association.removeLink"),
      }
    },
    [
      canAssociateExistingCredential,
      canManageCredentialAssociations,
      credentialProfileLinks,
      onAssociateAssociation,
      onUnlinkAssociation,
      t,
    ],
  )

  const getRuntimeEntryNavigationProps = useCallback(
    (entry: KeyManagementEntry) => {
      if (
        !associationTarget ||
        !isAccountRuntimeKeyLocatorMatch(
          entry.runtimeKey,
          associationTarget.locator,
        )
      ) {
        return undefined
      }
      return {
        targetId: getKeyManagementAssociationTargetId(associationTarget.id),
        isNavigationTarget: true as const,
      }
    },
    [associationTarget],
  )

  const getNativeNavigationProps = useCallback(
    (row: NativeKeyManagementRow) => {
      if (
        !associationTarget ||
        !isAccountKeyResourceLocatorMatch(
          row.facts.ref,
          associationTarget.locator,
        )
      ) {
        return undefined
      }
      return {
        targetId: getKeyManagementAssociationTargetId(associationTarget.id),
        isNavigationTarget: true as const,
      }
    },
    [associationTarget],
  )

  useEffect(() => {
    if (!associationTarget) {
      focusedAssociationSignatureRef.current = null
      return
    }
    if (isLoading || nativeLoading) return
    if (focusedAssociationSignatureRef.current === associationTargetSignature) {
      return
    }

    const target = document.getElementById(
      getKeyManagementAssociationTargetId(associationTarget.id),
    )
    if (!target) {
      onAssociationTargetStatusChange?.(
        KEY_MANAGEMENT_ASSOCIATION_TARGET_STATES.Missing,
      )
      return
    }

    target.scrollIntoView?.({ behavior: "smooth", block: "center" })
    target.focus({ preventScroll: true })
    focusedAssociationSignatureRef.current = associationTargetSignature
    onAssociationTargetStatusChange?.(
      KEY_MANAGEMENT_ASSOCIATION_TARGET_STATES.Found,
    )
  }, [
    associationTarget,
    associationTargetSignature,
    filteredDisplayRows,
    isLoading,
    nativeLoading,
    onAssociationTargetStatusChange,
  ])

  return {
    getAssociationPresentation,
    getNativeNavigationProps,
    getRuntimeEntryNavigationProps,
  }
}
