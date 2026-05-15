import { useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { Alert } from "~/components/ui"
import { Modal } from "~/components/ui/Dialog/Modal"
import { UI_CONSTANTS } from "~/constants/ui"
import { createDisplayAccountApiContext } from "~/services/accounts/utils/apiServiceRequest"
import type { CreateTokenRequest } from "~/services/apiService/common/type"
import { startProductAnalyticsAction } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/events"
import type { AccountToken, ApiToken, DisplaySiteData } from "~/types"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"

import { OneTimeApiKeyDialog } from "../OneTimeApiKeyDialog"
import { DialogHeader } from "./DialogHeader"
import { FormActions } from "./FormActions"
import { useTokenData } from "./hooks/useTokenData"
import { useTokenForm } from "./hooks/useTokenForm"
import { LoadingIndicator } from "./LoadingIndicator"
import { TokenForm } from "./TokenForm"
import { WarningNote } from "./WarningNote"

/**
 * Unified logger scoped to the Key Management add/edit token dialog.
 */
const logger = createLogger("AddTokenDialog")

const isCreatedApiToken = (value: unknown): value is ApiToken =>
  !!value &&
  typeof value === "object" &&
  typeof (value as Partial<ApiToken>).id === "number" &&
  typeof (value as Partial<ApiToken>).key === "string"

const keyManagementDialogAnalyticsContext = (
  actionId:
    | typeof PRODUCT_ANALYTICS_ACTION_IDS.CreateAccountToken
    | typeof PRODUCT_ANALYTICS_ACTION_IDS.UpdateAccountToken,
) => ({
  featureId: PRODUCT_ANALYTICS_FEATURE_IDS.KeyManagement,
  actionId,
  surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsKeyManagementDialog,
  entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
})

const startKeyManagementDialogAnalytics = (
  actionId:
    | typeof PRODUCT_ANALYTICS_ACTION_IDS.CreateAccountToken
    | typeof PRODUCT_ANALYTICS_ACTION_IDS.UpdateAccountToken,
) => {
  try {
    return startProductAnalyticsAction(
      keyManagementDialogAnalyticsContext(actionId),
    )
  } catch (error) {
    logger.warn("Add token dialog analytics start failed", error)
    return {
      complete: async () => undefined,
    }
  }
}

const completeKeyManagementDialogAnalytics = (
  tracker: ReturnType<typeof startProductAnalyticsAction>,
  ...args: Parameters<
    ReturnType<typeof startProductAnalyticsAction>["complete"]
  >
) => {
  try {
    void Promise.resolve(tracker.complete(...args)).catch((error) => {
      logger.warn("Add token dialog analytics completion failed", error)
    })
  } catch (error) {
    logger.warn("Add token dialog analytics completion failed", error)
  }
}

interface AddTokenDialogProps {
  isOpen: boolean
  onClose: () => void
  availableAccounts: DisplaySiteData[]
  preSelectedAccountId?: string | null
  editingToken?: AccountToken | null
  createPrefill?: {
    modelId: string
    defaultName?: string
    group?: string
    /**
     * Optional list of allowed group ids for create-mode. When provided, the group
     * selection UI should restrict the user to these groups.
     */
    allowedGroups?: string[]
  }
  prefillNotice?: string
  onSuccess?: (createdToken?: ApiToken) => void | Promise<void>
  showOneTimeKeyDialog?: boolean
}

/**
 * Modal dialog for creating/updating API tokens with form handling and validation.
 * @param props Component props container for dialog configuration.
 * @returns Modal element rendered through shared UI primitives.
 */
export default function AddTokenDialog(props: AddTokenDialogProps) {
  const { isOpen, onClose, availableAccounts, editingToken, onSuccess } = props
  const showOneTimeKeyDialog = props.showOneTimeKeyDialog ?? true
  const { t } = useTranslation("keyManagement")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [oneTimeToken, setOneTimeToken] = useState<ApiToken | null>(null)

  const { formData, setFormData, errors, validateForm, isEditMode, resetForm } =
    useTokenForm(props)

  const currentAccount = availableAccounts.find(
    (acc) => acc.id === formData.accountId,
  )

  const { isLoading, availableModels, groups, resetData } = useTokenData(
    isOpen,
    currentAccount,
    setFormData,
    !isEditMode ? props.createPrefill?.allowedGroups : undefined,
  )
  const showGroupSelection =
    Object.keys(groups).length > 0 ||
    (!isEditMode && (props.createPrefill?.allowedGroups?.length ?? 0) > 0)

  const handleClose = () => {
    resetForm()
    resetData()
    setOneTimeToken(null)
    onClose()
  }

  const handleCloseOneTimeKeyDialog = () => {
    setOneTimeToken(null)
    handleClose()
  }

  const handleSubmit = async () => {
    if (
      !currentAccount ||
      !validateForm({ requireGroup: showGroupSelection })
    ) {
      return
    }

    const tracker = startKeyManagementDialogAnalytics(
      isEditMode
        ? PRODUCT_ANALYTICS_ACTION_IDS.UpdateAccountToken
        : PRODUCT_ANALYTICS_ACTION_IDS.CreateAccountToken,
    )
    setIsSubmitting(true)
    try {
      const tokenData: CreateTokenRequest = {
        name: formData.name.trim(),
        remain_quota: formData.unlimitedQuota
          ? -1
          : Math.floor(
              parseFloat(formData.quota) *
                UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR,
            ),
        expired_time: formData.expiredTime
          ? Math.floor(new Date(formData.expiredTime).getTime() / 1000)
          : -1,
        unlimited_quota: formData.unlimitedQuota,
        model_limits_enabled: formData.modelLimitsEnabled,
        model_limits: formData.modelLimits.join(","),
        allow_ips: formData.allowIps.trim() || "",
        group: formData.group,
      }
      const { service, request } =
        createDisplayAccountApiContext(currentAccount)

      if (isEditMode && editingToken) {
        await service.updateApiToken(request, editingToken.id, tokenData)
        toast.success(t("dialog.updateSuccess"))
      } else {
        const created = await service.createApiToken(request, tokenData)
        const createdToken = isCreatedApiToken(created) ? created : undefined
        completeKeyManagementDialogAnalytics(
          tracker,
          PRODUCT_ANALYTICS_RESULTS.Success,
        )
        if (createdToken && showOneTimeKeyDialog) {
          setOneTimeToken(createdToken)
        } else {
          toast.success(t("dialog.createSuccess"))
        }
        if (onSuccess) {
          void Promise.resolve(onSuccess(createdToken)).catch((error) => {
            logger.error("AddTokenDialog onSuccess callback failed", error)
          })
        }

        if (createdToken && showOneTimeKeyDialog) {
          return
        }
      }

      if (isEditMode) {
        completeKeyManagementDialogAnalytics(
          tracker,
          PRODUCT_ANALYTICS_RESULTS.Success,
        )
      }
      handleClose()
      if (isEditMode && onSuccess) {
        void Promise.resolve(onSuccess()).catch((error) => {
          logger.error("AddTokenDialog onSuccess callback failed", error)
        })
      }
    } catch (error) {
      logger.error(`${isEditMode ? "更新" : "创建"}密钥失败`, error)
      const message = getErrorMessage(error)
      const fallbackMessage = isEditMode
        ? t("dialog.updateFailed")
        : t("dialog.createFailed")
      const displayMessage =
        message && message.trim() ? message : fallbackMessage

      toast.error(displayMessage)
      completeKeyManagementDialogAnalytics(
        tracker,
        PRODUCT_ANALYTICS_RESULTS.Failure,
        {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        },
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        size="lg"
        header={<DialogHeader isEditMode={isEditMode} />}
        footer={
          isLoading ? null : (
            <FormActions
              isSubmitting={isSubmitting}
              isEditMode={isEditMode}
              onClose={handleClose}
              onSubmit={handleSubmit}
              canSubmit={!!currentAccount}
            />
          )
        }
      >
        {isLoading ? (
          <LoadingIndicator />
        ) : (
          <div className="space-y-4">
            <TokenForm
              formData={formData}
              setFormData={setFormData}
              errors={errors}
              isEditMode={isEditMode}
              availableAccounts={availableAccounts}
              groups={groups}
              allowedGroups={
                !isEditMode ? props.createPrefill?.allowedGroups : undefined
              }
              availableModels={availableModels}
              showGroupSelection={showGroupSelection}
            />
            {typeof props.prefillNotice === "string" &&
            props.prefillNotice.trim().length > 0 ? (
              <Alert variant="info" description={props.prefillNotice} />
            ) : null}
            <WarningNote />
          </div>
        )}
      </Modal>
      <OneTimeApiKeyDialog
        isOpen={!!oneTimeToken}
        token={oneTimeToken}
        onClose={handleCloseOneTimeKeyDialog}
      />
    </>
  )
}
