import { useCallback, useMemo, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import {
  isAccountRuntimeKeyLocatorEqual,
  type AccountRuntimeKeyLocator,
} from "~/services/accounts/accountRuntimeKeys"
import { apiCredentialProfileLinks } from "~/services/apiCredentialProfiles/apiCredentialProfileLinks"
import type {
  ApiCredentialProfile,
  ApiCredentialProfileLink,
} from "~/types/apiCredentialProfiles"
import { API_CREDENTIAL_PROFILE_LINK_SOURCES } from "~/types/apiCredentialProfiles"

import {
  getCredentialAssociationForLocator,
  KEY_CREDENTIAL_ASSOCIATION_STATES,
} from "../credentialAssociations"

type AssociationPickerTarget = {
  locator: AccountRuntimeKeyLocator
  displayLabel?: string
  targetSecret?: string
}

interface UseKeyCredentialAssociationsParams {
  links: readonly ApiCredentialProfileLink[]
  profiles: readonly ApiCredentialProfile[]
  reloadLinks: () => Promise<void>
}

/** Owns credential-link mutations and the key-row association picker state. */
export function useKeyCredentialAssociations({
  links,
  profiles,
  reloadLinks,
}: UseKeyCredentialAssociationsParams) {
  const { t } = useTranslation("apiCredentialProfiles")
  const [pickerTarget, setPickerTarget] =
    useState<AssociationPickerTarget | null>(null)
  const [isAssociating, setIsAssociating] = useState(false)

  const clearPicker = useCallback(() => {
    setPickerTarget(null)
  }, [])

  const openPicker = useCallback(
    (
      locator: AccountRuntimeKeyLocator,
      displayLabel?: string,
      targetSecret?: string,
    ) => {
      setPickerTarget({ locator, displayLabel, targetSecret })
    },
    [],
  )

  const closePicker = useCallback(() => {
    if (!isAssociating) clearPicker()
  }, [clearPicker, isAssociating])

  const existingProfileNames = useMemo(() => {
    if (!pickerTarget) return []

    return links
      .filter((link) =>
        isAccountRuntimeKeyLocatorEqual(link.locator, pickerTarget.locator),
      )
      .map(
        (link) =>
          profiles.find((profile) => profile.id === link.profileId)?.name ??
          link.profileId,
      )
  }, [links, pickerTarget, profiles])

  const associate = useCallback(
    async (profileId: string) => {
      if (!pickerTarget) return

      const { locator } = pickerTarget
      setIsAssociating(true)
      try {
        // This is an explicit local choice; provider secrets are never re-derived or verified here.
        const existingLink = links.find((link) =>
          isAccountRuntimeKeyLocatorEqual(link.locator, locator),
        )
        if (existingLink) {
          await apiCredentialProfileLinks.relink({
            id: existingLink.id,
            profileId,
            locator,
            linkedBy: API_CREDENTIAL_PROFILE_LINK_SOURCES.User,
          })
        } else {
          await apiCredentialProfileLinks.link({
            profileId,
            locator,
            linkedBy: API_CREDENTIAL_PROFILE_LINK_SOURCES.User,
          })
        }
        await reloadLinks()
        clearPicker()
        toast.success(t("association.confirmed"))
      } catch {
        toast.error(t("association.updateFailed"))
      } finally {
        setIsAssociating(false)
      }
    },
    [clearPicker, links, pickerTarget, reloadLinks, t],
  )

  const unlink = useCallback(
    async (associationId: string) => {
      try {
        if (!(await apiCredentialProfileLinks.unlink(associationId))) return
        await reloadLinks()
        toast.success(t("association.removed"))
      } catch {
        toast.error(t("association.updateFailed"))
      }
    },
    [reloadLinks, t],
  )

  const getProfileForLocator = useCallback(
    (locator: AccountRuntimeKeyLocator) => {
      const association = getCredentialAssociationForLocator(links, locator)
      if (association.status !== KEY_CREDENTIAL_ASSOCIATION_STATES.Linked) {
        return undefined
      }
      return profiles.find((profile) => profile.id === association.profileId)
    },
    [links, profiles],
  )

  return {
    associate,
    clearPicker,
    closePicker,
    existingProfileNames,
    getProfileForLocator,
    isAssociating,
    openPicker,
    pickerTarget,
    unlink,
  }
}
