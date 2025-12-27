import { useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { Modal } from "~/components/ui/Dialog/Modal"
import { UI_CONSTANTS } from "~/constants/ui"
import { getApiService } from "~/services/apiService"
import type { CreateTokenRequest } from "~/services/apiService/common/type"
import type { DisplaySiteData } from "~/types"

import { AccountToken } from "../../type"
import { DialogHeader } from "./DialogHeader"
import { FormActions } from "./FormActions"
import { useTokenData } from "./hooks/useTokenData"
import { useTokenForm } from "./hooks/useTokenForm"
import { LoadingIndicator } from "./LoadingIndicator"
import { TokenForm } from "./TokenForm"
import { WarningNote } from "./WarningNote"

interface AddTokenDialogProps {
  isOpen: boolean
  onClose: () => void
  availableAccounts: DisplaySiteData[]
  preSelectedAccountId?: string | null
  editingToken?: AccountToken | null
}

/**
 * Modal dialog for creating/updating API tokens with form handling and validation.
 * @param props Component props container for dialog configuration.
 * @returns Modal element rendered through shared UI primitives.
 */
export default function AddTokenDialog(props: AddTokenDialogProps) {
  const { isOpen, onClose, availableAccounts, editingToken } = props
  const { t } = useTranslation("keyManagement")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const { formData, setFormData, errors, validateForm, isEditMode, resetForm } =
    useTokenForm(props)

  const currentAccount = availableAccounts.find(
    (acc) => acc.id === formData.accountId,
  )

  const { isLoading, availableModels, groups, resetData } = useTokenData(
    isOpen,
    currentAccount,
    setFormData,
  )

  const handleClose = () => {
    resetForm()
    resetData()
    onClose()
  }

  const handleSubmit = async () => {
    if (!currentAccount || !validateForm()) return

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

      if (isEditMode && editingToken) {
        await getApiService(currentAccount.siteType).updateApiToken(
          {
            baseUrl: currentAccount.baseUrl,
            accountId: currentAccount.id,
            auth: {
              authType: currentAccount.authType,
              userId: currentAccount.userId,
              accessToken: currentAccount.token,
              cookie: currentAccount.cookieAuthSessionCookie,
            },
          },
          editingToken.id,
          tokenData,
        )
        toast.success(t("dialog.updateSuccess"))
      } else {
        await getApiService(currentAccount.siteType).createApiToken(
          {
            baseUrl: currentAccount.baseUrl,
            accountId: currentAccount.id,
            auth: {
              authType: currentAccount.authType,
              userId: currentAccount.userId,
              accessToken: currentAccount.token,
              cookie: currentAccount.cookieAuthSessionCookie,
            },
          },
          tokenData,
        )
        toast.success(t("dialog.createSuccess"))
      }

      handleClose()
    } catch (error) {
      console.error(`${isEditMode ? "更新" : "创建"}密钥失败:`, error)
      toast.error(
        isEditMode ? t("dialog.updateFailed") : t("dialog.createFailed"),
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
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
            availableModels={availableModels}
          />
          <WarningNote />
        </div>
      )}
    </Modal>
  )
}
