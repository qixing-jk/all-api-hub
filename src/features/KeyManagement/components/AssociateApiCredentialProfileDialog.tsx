import type { TFunction } from "i18next"
import { Link2 } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  Button,
  Modal,
  Notice,
  SearchableSelect,
  Spinner,
} from "~/components/ui"
import {
  compareCredentialSecret,
  KEY_CREDENTIAL_SECRET_MATCHES,
} from "~/features/KeyManagement/credentialAssociations"
import {
  ACCOUNT_RUNTIME_KEY_SOURCES,
  type AccountRuntimeKeyLocator,
} from "~/services/accounts/accountRuntimeKeys"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"

import { KEY_MANAGEMENT_TEST_IDS } from "../testIds"

type AssociateApiCredentialProfileDialogProps = {
  isOpen: boolean
  locator: AccountRuntimeKeyLocator | null
  profiles: readonly ApiCredentialProfile[]
  isProfilesLoading: boolean
  existingProfileNames: readonly string[]
  isWorking: boolean
  displayLabel?: string
  targetSecret?: string
  onClose: () => void
  onAssociate: (profileId: string) => Promise<void>
  onOpenProfiles: () => void
}

const getSecretComparisonDescription = (
  match: (typeof KEY_CREDENTIAL_SECRET_MATCHES)[keyof typeof KEY_CREDENTIAL_SECRET_MATCHES],
  t: TFunction,
) => {
  switch (match) {
    case KEY_CREDENTIAL_SECRET_MATCHES.Exact:
      return t(
        "apiCredentialProfiles:association.secretComparison.exactDescription",
      )
    case KEY_CREDENTIAL_SECRET_MATCHES.Masked:
      return t(
        "apiCredentialProfiles:association.secretComparison.maskedDescription",
      )
    case KEY_CREDENTIAL_SECRET_MATCHES.Mismatch:
      return t(
        "apiCredentialProfiles:association.secretComparison.mismatchDescription",
      )
    case KEY_CREDENTIAL_SECRET_MATCHES.Unknown:
      return t(
        "apiCredentialProfiles:association.secretComparison.unknownDescription",
      )
  }
}

const getLocatorLabel = (
  locator: AccountRuntimeKeyLocator | null,
  t: TFunction,
  displayLabel?: string,
) => {
  if (!locator) return ""
  switch (locator.source) {
    case ACCOUNT_RUNTIME_KEY_SOURCES.AccountToken:
      if (displayLabel?.trim()) return displayLabel.trim()
      return t("apiCredentialProfiles:association.accountToken", {
        id: locator.tokenId,
      })
    case ACCOUNT_RUNTIME_KEY_SOURCES.AccountKeyResource:
      return t("apiCredentialProfiles:association.keyResource", {
        id: locator.ref.resourceId,
      })
    case ACCOUNT_RUNTIME_KEY_SOURCES.ServiceCredential:
      return t("apiCredentialProfiles:association.serviceCredential", {
        service: locator.service,
      })
  }
}

/** Lets a user attach an existing local credential profile to the current key. */
export function AssociateApiCredentialProfileDialog({
  isOpen,
  locator,
  profiles,
  isProfilesLoading,
  existingProfileNames,
  isWorking,
  displayLabel,
  targetSecret,
  onClose,
  onAssociate,
  onOpenProfiles,
}: AssociateApiCredentialProfileDialogProps) {
  const { t } = useTranslation(["apiCredentialProfiles", "common"])
  const [selectedProfileId, setSelectedProfileId] = useState("")

  useEffect(() => {
    if (!isOpen) setSelectedProfileId("")
  }, [isOpen])

  const options = useMemo(
    () =>
      profiles.map((profile) => ({
        value: profile.id,
        label: `${profile.name} · ${profile.baseUrl}`,
      })),
    [profiles],
  )

  const selectedProfile = profiles.find(
    (profile) => profile.id === selectedProfileId,
  )
  const selectedProfileMatch = selectedProfile
    ? compareCredentialSecret(targetSecret, selectedProfile.apiKey)
    : null

  const handleAssociate = async () => {
    if (!selectedProfileId) return
    await onAssociate(selectedProfileId)
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={isWorking ? () => undefined : onClose}
      closeOnEsc={!isWorking}
      closeOnBackdropClick={!isWorking}
      showCloseButton={!isWorking}
      size="md"
      header={
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-base font-semibold">
            <Link2 aria-hidden="true" className="h-4 w-4" />
            {t("apiCredentialProfiles:association.linkExisting")}
          </div>
          <p className="text-muted-foreground text-sm">
            {t("apiCredentialProfiles:association.linkExistingDescription")}
          </p>
        </div>
      }
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isWorking}
          >
            {t("common:actions.cancel")}
          </Button>
          <Button
            type="button"
            data-testid={
              KEY_MANAGEMENT_TEST_IDS.associateCredentialConfirmButton
            }
            onClick={() => void handleAssociate()}
            disabled={!selectedProfileId || isProfilesLoading || isWorking}
          >
            {isWorking ? <Spinner size="sm" /> : null}
            {t("apiCredentialProfiles:association.linkExisting")}
          </Button>
        </div>
      }
      panelTestId={KEY_MANAGEMENT_TEST_IDS.associateCredentialDialog}
    >
      <div className="space-y-4">
        <div className="rounded-md border p-3 text-sm">
          <div className="text-muted-foreground text-xs">
            {t("apiCredentialProfiles:association.resourceLabel")}
          </div>
          <div className="mt-1 font-medium break-all">
            {getLocatorLabel(locator, t, displayLabel)}
          </div>
        </div>

        {existingProfileNames.length > 0 ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
            {t("apiCredentialProfiles:association.replaceExisting", {
              names: existingProfileNames.join(", "),
            })}
          </div>
        ) : null}

        {isProfilesLoading ? (
          <div
            role="status"
            className="text-muted-foreground flex items-center gap-2 text-sm"
          >
            <Spinner size="sm" />
            {t("apiCredentialProfiles:association.loadingProfiles")}
          </div>
        ) : profiles.length > 0 ? (
          <>
            <SearchableSelect
              data-testid={
                KEY_MANAGEMENT_TEST_IDS.associateCredentialProfileSelect
              }
              options={options}
              value={selectedProfileId}
              onChange={setSelectedProfileId}
              placeholder={t(
                "apiCredentialProfiles:association.profilePlaceholder",
              )}
              searchPlaceholder={t(
                "apiCredentialProfiles:controls.searchPlaceholder",
              )}
            />
            {selectedProfileMatch ? (
              <Notice
                tone={
                  selectedProfileMatch ===
                  KEY_CREDENTIAL_SECRET_MATCHES.Mismatch
                    ? "warning"
                    : "info"
                }
                description={getSecretComparisonDescription(
                  selectedProfileMatch,
                  t,
                )}
              />
            ) : null}
          </>
        ) : (
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              {t("apiCredentialProfiles:association.noProfiles")}
            </p>
            <Button type="button" variant="outline" onClick={onOpenProfiles}>
              {t("apiCredentialProfiles:empty.keyManagementLink")}
            </Button>
          </div>
        )}
      </div>
    </Modal>
  )
}
