import { Copy, Eye, EyeOff } from "lucide-react"
import { useLayoutEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { IconButton } from "~/components/ui"
import { useRuntimeKeyDisclosure } from "~/features/KeyManagement/components/RuntimeKeyActions/useRuntimeKeyDisclosure"
import toast from "~/lib/notify"
import type { AccountRuntimeKey } from "~/services/accounts/keys/accountRuntimeKeys"
import type { DisplaySiteData } from "~/types"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"
import {
  maskSecretForDisplay,
  normalizeSecretMaskForDisplay,
} from "~/utils/core/formatters"

/** Shared disclosure for native inventory and explicitly linked local secrets. */
export function useAccountKeySecretDisclosure({
  account,
  runtimeKey,
  recoverable,
  associatedProfile,
  maskedLabel,
  displayName,
}: {
  account: DisplaySiteData
  runtimeKey: AccountRuntimeKey
  recoverable: boolean
  associatedProfile?: ApiCredentialProfile
  maskedLabel?: string
  displayName: string
}) {
  const { t } = useTranslation(["keyManagement", "common"])
  const disclosure = useRuntimeKeyDisclosure(account, runtimeKey)
  const [revealedSecret, setRevealedSecret] = useState<{
    profileId: string
    apiKey: string
    accountId: string
    runtimeKeyId: string
  } | null>(null)
  const associatedProfileWithSecret = associatedProfile?.apiKey.trim()
    ? associatedProfile
    : undefined
  const isSecretVisible =
    associatedProfileWithSecret !== undefined &&
    revealedSecret?.profileId === associatedProfileWithSecret.id &&
    revealedSecret.apiKey === associatedProfileWithSecret.apiKey &&
    revealedSecret.accountId === account.id &&
    revealedSecret.runtimeKeyId === runtimeKey.id
  const hasAssociatedSecret = Boolean(associatedProfileWithSecret)
  useLayoutEffect(() => {
    setRevealedSecret(null)
  }, [
    account.id,
    account.baseUrl,
    account.siteType,
    runtimeKey.id,
    associatedProfileWithSecret?.id,
    associatedProfileWithSecret?.apiKey,
  ])
  const maskedDisplay = maskedLabel
    ? normalizeSecretMaskForDisplay(maskedLabel)
    : undefined
  const secret = recoverable
    ? disclosure.secret ?? maskedDisplay
    : associatedProfileWithSecret
      ? isSecretVisible
        ? associatedProfileWithSecret.apiKey
        : maskedDisplay ??
          maskSecretForDisplay(associatedProfileWithSecret.apiKey)
      : maskedDisplay
  const copyAssociatedSecret = async () => {
    if (!associatedProfileWithSecret) return
    try {
      await navigator.clipboard.writeText(associatedProfileWithSecret.apiKey)
      toast.success(
        t("keyManagement:messages.keyCopied", {
          name: displayName,
        }),
      )
    } catch {
      toast.error(t("keyManagement:messages.copyFailed"))
    }
  }
  const secretControls = recoverable ? (
    <IconButton
      type="button"
      size="sm"
      variant="ghost"
      loading={disclosure.resolving}
      aria-label={
        disclosure.visible ? t("actions.hideKey") : t("actions.showKey")
      }
      tooltip={disclosure.visible ? t("actions.hideKey") : t("actions.showKey")}
      onClick={() => void disclosure.toggle()}
    >
      {disclosure.visible ? (
        <EyeOff aria-hidden="true" className="h-4 w-4" />
      ) : (
        <Eye aria-hidden="true" className="h-4 w-4" />
      )}
    </IconButton>
  ) : hasAssociatedSecret ? (
    <>
      {/* These local disclosure actions do not resolve provider secrets, so the
          existing provider reveal/copy analytics would misclassify them. */}
      <IconButton
        type="button"
        size="sm"
        variant="ghost"
        aria-label={
          isSecretVisible
            ? t("keyManagement:actions.hideKey")
            : t("keyManagement:actions.showKey")
        }
        tooltip={
          isSecretVisible
            ? t("keyManagement:actions.hideKey")
            : t("keyManagement:actions.showKey")
        }
        onClick={() =>
          setRevealedSecret(
            isSecretVisible || !associatedProfileWithSecret
              ? null
              : {
                  profileId: associatedProfileWithSecret.id,
                  apiKey: associatedProfileWithSecret.apiKey,
                  accountId: account.id,
                  runtimeKeyId: runtimeKey.id,
                },
          )
        }
      >
        {isSecretVisible ? (
          <EyeOff aria-hidden="true" className="h-4 w-4" />
        ) : (
          <Eye aria-hidden="true" className="h-4 w-4" />
        )}
      </IconButton>
      <IconButton
        type="button"
        size="sm"
        variant="ghost"
        aria-label={t("common:actions.copyKey")}
        tooltip={t("common:actions.copyKey")}
        onClick={() => void copyAssociatedSecret()}
      >
        <Copy aria-hidden="true" className="h-4 w-4" />
      </IconButton>
    </>
  ) : undefined

  return {
    secret,
    secretControls,
    associatedProfileWithSecret,
    hasAssociatedSecret,
    copy: disclosure.copy,
  }
}
