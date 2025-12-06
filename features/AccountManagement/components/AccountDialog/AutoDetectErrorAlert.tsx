import { QuestionMarkCircleIcon } from "@heroicons/react/24/outline"
import { useTranslation } from "react-i18next"

import { Alert, Button } from "~/components/ui"
import type { AutoDetectErrorProps } from "~/utils/autoDetectUtils"
import { openLoginTab } from "~/utils/autoDetectUtils"

/**
 * Alert displayed when automatic credential detection fails so users can recover.
 * @param props Component props describing the error context and handlers.
 * @param props.error Error metadata powering the alert content.
 * @param props.siteUrl Optional site URL used for fallback login redirection.
 * @param props.onHelpClick Optional handler invoked when help action is triggered.
 * @param props.onActionClick Optional handler invoked when custom action button is pressed.
 */
export default function AutoDetectErrorAlert({
  error,
  siteUrl,
  onHelpClick,
  onActionClick,
}: AutoDetectErrorProps) {
  const { t } = useTranslation("accountDialog")

  const handleActionClick = async () => {
    if (onActionClick) {
      onActionClick()
    } else if (error.type === "unauthorized" && siteUrl) {
      // 默认行为：打开登录页面
      await openLoginTab(siteUrl)
    }
  }

  const handleHelpClick = () => {
    if (onHelpClick) {
      onHelpClick()
    } else if (error.helpDocUrl) {
      // 默认行为：打开帮助文档
      browser.tabs.create({ url: error.helpDocUrl, active: true })
    }
  }

  return (
    <Alert variant="warning" className="mb-4">
      <div>
        <p className="mb-2 text-xs">{error.message}</p>

        {/* 操作按钮区域 */}
        {(error.actionText || error.helpDocUrl) && (
          <div className="flex space-x-2">
            {/* 主要操作按钮 */}
            {error.actionText && (
              <Button
                type="button"
                onClick={handleActionClick}
                variant="warning"
                size="sm"
              >
                {error.actionText}
              </Button>
            )}

            {/* 帮助文档按钮 */}
            {error.helpDocUrl && (
              <Button
                type="button"
                onClick={handleHelpClick}
                variant="secondary"
                size="sm"
                leftIcon={<QuestionMarkCircleIcon className="h-3 w-3" />}
              >
                {t("actions.helpDocument")}
              </Button>
            )}
          </div>
        )}
      </div>
    </Alert>
  )
}
