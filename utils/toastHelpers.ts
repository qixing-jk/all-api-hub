import { t } from "i18next"
import toast from "react-hot-toast"

type ToastParams =
  | [success: boolean, successMsg: string, errorMsg?: string]
  | [{ success: boolean; message: string }]

/**
 * Shows a toast notification based on the success status of an operation.
 */
export function showResultToast(...args: ToastParams): void {
  if (typeof args[0] === "boolean") {
    // 兼容旧逻辑
    const [success, successMsg, errorMsg = ""] = args
    const message = success ? successMsg : errorMsg
    if (message) {
      toast[success ? "success" : "error"](message)
    }
  } else {
    // 支持对象参数
    const { success, message = "" } = args[0]
    if (message) {
      toast[success ? "success" : "error"](message)
    }
  }
}

/**
 * Shows a toast notification for an update operation.
 * @param success - Whether the update was successful.
 * @param setting - The name of the setting that was updated.
 */
export const showUpdateToast = (success: boolean, setting: string): void => {
  const successMsg = t("settings:messages.updateSuccess", { name: setting })
  const errorMsg = t("settings:messages.updateFailed", { name: setting })
  showResultToast(success, successMsg, errorMsg)
}

/**
 * Shows a toast notification for a reset operation.
 * @param success - Whether the reset was successful.
 */
export const showResetToast = (success: boolean): void => {
  const successMsg = t("settings:messages.updateSuccess")
  const errorMsg = t("settings:danger.resetFailed")
  showResultToast(success, successMsg, errorMsg)
}
