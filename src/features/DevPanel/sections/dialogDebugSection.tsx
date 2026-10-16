import {
  Bell,
  FileText,
  Languages,
  ShieldAlert,
  Sparkles,
  TriangleAlert,
} from "lucide-react"
import { useCallback, useMemo, useState } from "react"

import {
  ContentNotice,
  ContentNoticeAction,
} from "~/components/toast/ContentNotice"
import { useUpdateLogDialogContext } from "~/features/UpdateLog"
import toast from "~/lib/notify"
import { debugQueuePopupInterruptionHint } from "~/services/popupInterruptionHint"
import { changelogOnUpdateState } from "~/services/updates/changelogOnUpdateState"
import { getExtensionVersion } from "~/utils/browser/runtime"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { openPermissionsOnboardingPage } from "~/utils/navigation"

import type { DevPanelSection } from "../types"

const logger = createLogger("DevDialogDebugSection")

/**
 * Builds the DOMException shape React commonly reports after browser translation rewrites DOM nodes.
 */
function createDevTranslationCrashError() {
  return new DOMException(
    "Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of this node.",
    "NotFoundError",
  )
}

/**
 * Global dialog-debug actions formerly hosted by the header DevDialogDebugMenu.
 * Throwing state (translation crash) lives here so the failure surfaces through
 * the same root error boundary as before.
 */
export function useDialogDebugDevSection(): DevPanelSection {
  const { openDialog } = useUpdateLogDialogContext()
  const [shouldTriggerTranslationCrash, setShouldTriggerTranslationCrash] =
    useState(false)

  if (shouldTriggerTranslationCrash) {
    throw createDevTranslationCrashError()
  }

  const handleTriggerUpdateLog = useCallback(async () => {
    try {
      const version = getExtensionVersion("")
      if (!version) return

      await changelogOnUpdateState.setPendingVersion(version)
      const pendingVersion =
        await changelogOnUpdateState.consumePendingVersion()
      if (!pendingVersion) return

      openDialog(pendingVersion)
    } catch (error) {
      const message = getErrorMessage(error)
      logger.debug("Failed to trigger update log (dev)", { error: message })
      toast.error(`Failed to trigger update log (dev): ${message}`)
    }
  }, [openDialog])

  const handleTriggerOnboarding = useCallback(async () => {
    try {
      await openPermissionsOnboardingPage({ reason: "debug" })
    } catch (error) {
      const message = getErrorMessage(error)
      logger.debug("Failed to trigger onboarding (dev)", { error: message })
      toast.error(`Failed to trigger onboarding (dev): ${message}`)
    }
  }, [])

  const handleQueuePopupInterruptionHint = useCallback(async () => {
    try {
      await debugQueuePopupInterruptionHint()
      toast.success("Queued popup interruption hint (dev)")
    } catch (error) {
      const message = getErrorMessage(error)
      logger.debug("Failed to queue popup interruption hint (dev)", {
        error: message,
      })
      toast.error(`Failed to queue popup interruption hint (dev): ${message}`)
    }
  }, [])

  const handlePreviewTurnstileReminder = useCallback(() => {
    toast.info("后台任务需要你完成人机验证，完成后将自动继续。", {
      title: "All API Hub · 验证提醒",
      duration: 10_000,
      action: {
        label: "打开验证窗口",
        onClick: () => {
          toast.success("Dev: 点击了主操作【打开验证窗口】")
        },
      },
      secondaryAction: {
        label: "提醒设置",
        onClick: () => {
          toast.success("Dev: 点击了次操作【提醒设置】")
        },
      },
    })
  }, [])

  const handlePreviewContentNotice = useCallback(() => {
    toast.custom(
      (instance) => (
        <div className="w-[360px] max-w-[96vw]">
          <ContentNotice
            title="需要完成人机验证"
            onClose={() => toast.dismiss(instance.id)}
            actions={
              <>
                <ContentNoticeAction
                  variant="secondary"
                  onClick={() => toast.dismiss(instance.id)}
                >
                  取消
                </ContentNoticeAction>
                <ContentNoticeAction
                  onClick={() => {
                    toast.success("Dev: 操作已确认")
                    toast.dismiss(instance.id)
                  }}
                >
                  完成验证
                </ContentNoticeAction>
              </>
            }
          >
            <p>
              自动验证还没有完成。请在这个窗口里完成 Cloudflare Turnstile
              验证（例如勾选“确认您是真人”）。完成后会自动继续。
            </p>
          </ContentNotice>
        </div>
      ),
      { duration: 10_000 },
    )
  }, [])

  return useMemo(
    () => ({
      id: "dialog-debug",
      title: "Dialogs",
      surfaces: ["options", "popup", "sidepanel"] as const,
      actions: [
        {
          id: "preview-turnstile-reminder",
          label: "Dev: Preview Turnstile reminder",
          icon: Bell,
          run: handlePreviewTurnstileReminder,
        },
        {
          id: "preview-content-notice",
          label: "Dev: Preview ContentNotice (toast)",
          icon: ShieldAlert,
          run: handlePreviewContentNotice,
        },
        {
          id: "trigger-update-log",
          label: "Dev: Trigger update log",
          icon: FileText,
          run: handleTriggerUpdateLog,
        },
        {
          id: "trigger-onboarding",
          label: "Dev: Trigger onboarding",
          icon: Sparkles,
          run: handleTriggerOnboarding,
        },
        {
          id: "queue-popup-interruption-hint",
          label: "Dev: Queue popup interruption hint",
          icon: TriangleAlert,
          run: handleQueuePopupInterruptionHint,
        },
        {
          id: "trigger-translation-crash",
          label: "Dev: Trigger translation crash",
          icon: Languages,
          run: () => setShouldTriggerTranslationCrash(true),
        },
      ],
    }),
    [
      handlePreviewContentNotice,
      handlePreviewTurnstileReminder,
      handleQueuePopupInterruptionHint,
      handleTriggerOnboarding,
      handleTriggerUpdateLog,
    ],
  )
}
