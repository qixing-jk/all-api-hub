import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  findDefaultSelectableAccountRuntimeKey,
  isAccountRuntimeKeyCompatibleWithModel,
  isSelectableAccountRuntimeKey,
  sortAccountRuntimeKeysActiveFirst,
  type AccountRuntimeKey,
} from "~/services/accounts/keys/accountRuntimeKeys"
import { fetchDisplayAccountRuntimeKeys } from "~/services/accounts/utils/apiServiceRequest"
import { toSanitizedErrorSummary } from "~/services/verification/aiApiVerification/utils"
import { createLogger } from "~/utils/core/logger"

import { filterVerificationRedactions as filterRedactions } from "../verificationDialogUtils"
import type { VerifyApiDialogProps } from "./types"

const logger = createLogger("VerifyApiDialog")

/**
 * Applies model/group context to the owner-projected runtime-key policy.
 */
function isRuntimeKeyCompatibleWithModel(
  runtimeKey: AccountRuntimeKey,
  options: {
    hasModelContext: boolean
    requestedModelId: string
    modelEnableGroups: VerifyApiDialogProps["modelEnableGroups"]
  },
) {
  if (!isSelectableAccountRuntimeKey(runtimeKey)) return false
  if (!options.hasModelContext) return true
  return isAccountRuntimeKeyCompatibleWithModel(runtimeKey, {
    id: options.requestedModelId,
    enableGroups: options.modelEnableGroups,
  })
}

/** Own runtime-key loading, selection and model compatibility for account verification. */
export function useAccountVerificationRuntimeKeys({
  account,
  requestedModelId,
  modelEnableGroups,
  captureContext,
}: {
  account: VerifyApiDialogProps["account"]
  requestedModelId: string
  modelEnableGroups: VerifyApiDialogProps["modelEnableGroups"]
  captureContext: () => () => boolean
}) {
  const { t } = useTranslation("aiApiVerification")
  const [isLoadingRuntimeKeys, setIsLoadingRuntimeKeys] = useState(false)
  const [runtimeKeysLoadFailed, setRuntimeKeysLoadFailed] = useState(false)
  const [accountRuntimeKeys, setAccountRuntimeKeys] = useState<
    AccountRuntimeKey[]
  >([])
  const [selectedRuntimeKeyId, setSelectedRuntimeKeyId] = useState<string>("")
  const selectedRuntimeKey = accountRuntimeKeys.find(
    (runtimeKey) => runtimeKey.id === selectedRuntimeKeyId,
  )

  const hasModelContext = requestedModelId.length > 0
  const compatibleRuntimeKeys = useMemo(() => {
    return accountRuntimeKeys.filter((runtimeKey) =>
      isRuntimeKeyCompatibleWithModel(runtimeKey, {
        hasModelContext,
        requestedModelId,
        modelEnableGroups,
      }),
    )
  }, [accountRuntimeKeys, hasModelContext, modelEnableGroups, requestedModelId])
  const compatibleRuntimeKeyIds = useMemo(
    () => new Set(compatibleRuntimeKeys.map((runtimeKey) => runtimeKey.id)),
    [compatibleRuntimeKeys],
  )
  const hasLoadedRuntimeKeys =
    !isLoadingRuntimeKeys && accountRuntimeKeys.length > 0
  const hasNoCompatibleRuntimeKey =
    hasModelContext &&
    hasLoadedRuntimeKeys &&
    compatibleRuntimeKeys.length === 0
  const selectedRuntimeKeyIsCompatible =
    !selectedRuntimeKey || compatibleRuntimeKeyIds.has(selectedRuntimeKey.id)
  const hasIncompatibleSelectedRuntimeKey =
    hasModelContext &&
    selectedRuntimeKey !== undefined &&
    !selectedRuntimeKeyIsCompatible
  const runtimeKeyCompatibilityHint = hasNoCompatibleRuntimeKey
    ? t("verifyDialog.noCompatibleRuntimeKeyHint")
    : hasIncompatibleSelectedRuntimeKey
      ? t("verifyDialog.selectedRuntimeKeyIncompatibleHint")
      : null

  const tokenModelHint = selectedRuntimeKey?.modelAccess.suggestedModelIds[0]

  const loadRuntimeKeys = async () => {
    const isCurrentContext = captureContext()
    setIsLoadingRuntimeKeys(true)
    setRuntimeKeysLoadFailed(false)
    try {
      const runtimeKeys = await fetchDisplayAccountRuntimeKeys(account)
      if (!isCurrentContext()) return

      const sorted = sortAccountRuntimeKeysActiveFirst(runtimeKeys)

      setAccountRuntimeKeys(sorted)

      const defaultRuntimeKey = hasModelContext
        ? (sorted.find((runtimeKey) =>
            isRuntimeKeyCompatibleWithModel(runtimeKey, {
              hasModelContext,
              requestedModelId,
              modelEnableGroups,
            }),
          ) ?? null)
        : findDefaultSelectableAccountRuntimeKey(sorted)
      setSelectedRuntimeKeyId(defaultRuntimeKey ? defaultRuntimeKey.id : "")
    } catch (error) {
      if (!isCurrentContext()) return
      setRuntimeKeysLoadFailed(true)
      logger.error("Failed to load runtime keys", {
        message: toSanitizedErrorSummary(
          error,
          filterRedactions([account.token, account.cookieAuthSessionCookie]),
        ),
      })
      setAccountRuntimeKeys([])
      setSelectedRuntimeKeyId("")
    } finally {
      if (isCurrentContext()) setIsLoadingRuntimeKeys(false)
    }
  }

  return {
    isLoadingRuntimeKeys,
    runtimeKeysLoadFailed,
    accountRuntimeKeys,
    selectedRuntimeKeyId,
    setSelectedRuntimeKeyId,
    selectedRuntimeKey,
    compatibleRuntimeKeyIds,
    selectedRuntimeKeyIsCompatible,
    runtimeKeyCompatibilityHint,
    tokenModelHint,
    loadRuntimeKeys,
    resetRuntimeKeys: () => {
      setAccountRuntimeKeys([])
      setSelectedRuntimeKeyId("")
    },
  }
}
