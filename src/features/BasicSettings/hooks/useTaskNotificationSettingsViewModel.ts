import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { useDeferredPreferenceDraft } from "~/hooks/preferences/useDeferredPreferenceDraft"
import {
  sendTaskNotificationMessage,
  TaskNotificationMessageTypes,
} from "~/services/notifications/messaging"
import {
  hasPermission,
  onOptionalPermissionsChanged,
  OPTIONAL_PERMISSION_IDS,
  requestPermissionDetailed,
} from "~/services/permissions/permissionManager"
import { userPreferences } from "~/services/preferences/userPreferences"
import { trackOptionalPermissionRequestResult } from "~/services/productAnalytics/facts/permissions"
import { DEFAULT_SITE_ANNOUNCEMENT_PREFERENCES } from "~/types/siteAnnouncements"
import {
  DEFAULT_TASK_NOTIFICATION_PREFERENCES,
  TASK_NOTIFICATION_CHANNELS,
  type TaskNotificationChannel,
  type TaskNotificationChannelPreferences,
  type TaskNotificationTask,
  type TaskNotificationTaskPreferences,
} from "~/types/taskNotifications"
import type { DeepPartial } from "~/types/utils"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { showResultToast } from "~/utils/feedback/operationFeedback"
import { showUpdateToast } from "~/utils/feedback/preferenceFeedback"
import { matchesDefaultSettings } from "~/utils/preferences/matchesDefaultSettings"

const logger = createLogger("TaskNotificationSettings")

/** Owns notification drafts, permission changes, and save-before-test commands. */
export function useTaskNotificationSettingsViewModel() {
  const { t } = useTranslation(["settings", "common"])
  const {
    preferences,
    siteAnnouncementNotifications,
    taskNotifications,
    updateSiteAnnouncementNotifications,
    updateTaskNotifications,
    loadPreferences,
  } = useUserPreferencesContext()
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(
    null,
  )
  const [isRequestingPermission, setIsRequestingPermission] = useState(false)
  const [testingChannel, setTestingChannel] =
    useState<TaskNotificationChannel | null>(null)
  const channels = taskNotifications.channels
  const savedVersion = preferences?.lastUpdated ?? 0
  const savedTelegramChannel = channels[TASK_NOTIFICATION_CHANNELS.Telegram]
  const savedFeishuChannel = channels[TASK_NOTIFICATION_CHANNELS.Feishu]
  const savedDingtalkChannel = channels[TASK_NOTIFICATION_CHANNELS.Dingtalk]
  const savedWecomChannel = channels[TASK_NOTIFICATION_CHANNELS.Wecom]
  const savedNtfyChannel = channels[TASK_NOTIFICATION_CHANNELS.Ntfy]
  const savedWebhookChannel = channels[TASK_NOTIFICATION_CHANNELS.Webhook]

  const handleChannelUpdate = async (
    channelUpdates: DeepPartial<TaskNotificationChannelPreferences>,
    label: string,
  ) => {
    const result = await updateTaskNotifications({ channels: channelUpdates })
    showUpdateToast(result, label)
    return result.ok
  }

  const savedTelegramDraft = useMemo(
    () => ({
      botToken: savedTelegramChannel.botToken,
      chatId: savedTelegramChannel.chatId,
    }),
    [savedTelegramChannel],
  )
  const telegram = useDeferredPreferenceDraft({
    savedValue: savedTelegramDraft,
    savedVersion,
    onCommit: async (draft) => {
      const value = {
        botToken: draft.botToken.trim(),
        chatId: draft.chatId.trim(),
      }
      const ok = await handleChannelUpdate(
        { [TASK_NOTIFICATION_CHANNELS.Telegram]: value },
        t("taskNotifications.channels.telegram.title"),
      )
      return { ok, value }
    },
  })

  const savedFeishuDraft = useMemo(
    () => ({
      webhookKey: savedFeishuChannel.webhookKey,
    }),
    [savedFeishuChannel],
  )
  const feishu = useDeferredPreferenceDraft({
    savedValue: savedFeishuDraft,
    savedVersion,
    onCommit: async (draft) => {
      const value = { webhookKey: draft.webhookKey.trim() }
      const ok = await handleChannelUpdate(
        { [TASK_NOTIFICATION_CHANNELS.Feishu]: value },
        t("taskNotifications.channels.feishu.title"),
      )
      return { ok, value }
    },
  })

  const savedDingtalkDraft = useMemo(
    () => ({
      webhookKey: savedDingtalkChannel.webhookKey,
      secret: savedDingtalkChannel.secret,
    }),
    [savedDingtalkChannel],
  )
  const dingtalk = useDeferredPreferenceDraft({
    savedValue: savedDingtalkDraft,
    savedVersion,
    onCommit: async (draft) => {
      const value = {
        webhookKey: draft.webhookKey.trim(),
        secret: draft.secret.trim(),
      }
      const ok = await handleChannelUpdate(
        { [TASK_NOTIFICATION_CHANNELS.Dingtalk]: value },
        t("taskNotifications.channels.dingtalk.title"),
      )
      return { ok, value }
    },
  })

  const savedWecomDraft = useMemo(
    () => ({
      webhookKey: savedWecomChannel.webhookKey,
    }),
    [savedWecomChannel],
  )
  const wecom = useDeferredPreferenceDraft({
    savedValue: savedWecomDraft,
    savedVersion,
    onCommit: async (draft) => {
      const value = { webhookKey: draft.webhookKey.trim() }
      const ok = await handleChannelUpdate(
        { [TASK_NOTIFICATION_CHANNELS.Wecom]: value },
        t("taskNotifications.channels.wecom.title"),
      )
      return { ok, value }
    },
  })

  const savedNtfyDraft = useMemo(
    () => ({
      topicUrl: savedNtfyChannel.topicUrl,
      accessToken: savedNtfyChannel.accessToken,
    }),
    [savedNtfyChannel],
  )
  const ntfy = useDeferredPreferenceDraft({
    savedValue: savedNtfyDraft,
    savedVersion,
    onCommit: async (draft) => {
      const value = {
        topicUrl: draft.topicUrl.trim(),
        accessToken: draft.accessToken.trim(),
      }
      const ok = await handleChannelUpdate(
        { [TASK_NOTIFICATION_CHANNELS.Ntfy]: value },
        t("taskNotifications.channels.ntfy.title"),
      )
      return { ok, value }
    },
  })

  const savedWebhookDraft = useMemo(
    () => ({ url: savedWebhookChannel.url }),
    [savedWebhookChannel],
  )
  const webhook = useDeferredPreferenceDraft({
    savedValue: savedWebhookDraft,
    savedVersion,
    onCommit: async (draft) => {
      const value = { url: draft.url.trim() }
      const ok = await handleChannelUpdate(
        { [TASK_NOTIFICATION_CHANNELS.Webhook]: value },
        t("taskNotifications.channels.webhook.title"),
      )
      return { ok, value }
    },
  })

  const refreshPermissionStatus = useCallback(async () => {
    const granted = await hasPermission(OPTIONAL_PERMISSION_IDS.Notifications)
    setPermissionGranted(granted)
  }, [])

  useEffect(() => {
    void refreshPermissionStatus()
    const unsubscribe = onOptionalPermissionsChanged(() => {
      void refreshPermissionStatus()
    })
    return unsubscribe
  }, [refreshPermissionStatus])

  const handleGlobalToggle = async (enabled: boolean) => {
    const writeResult = await updateTaskNotifications({ enabled })
    showUpdateToast(writeResult, t("taskNotifications.enable"))
  }

  const createChannelToggle =
    (channel: TaskNotificationChannel, titleKey: string) =>
    async (enabled: boolean) => {
      await handleChannelUpdate({ [channel]: { enabled } }, t(titleKey))
    }

  const handleBrowserChannelToggle = createChannelToggle(
    TASK_NOTIFICATION_CHANNELS.Browser,
    "taskNotifications.channels.browser.title",
  )
  const handleTelegramChannelToggle = createChannelToggle(
    TASK_NOTIFICATION_CHANNELS.Telegram,
    "taskNotifications.channels.telegram.title",
  )
  const handleFeishuChannelToggle = createChannelToggle(
    TASK_NOTIFICATION_CHANNELS.Feishu,
    "taskNotifications.channels.feishu.title",
  )
  const handleDingtalkChannelToggle = createChannelToggle(
    TASK_NOTIFICATION_CHANNELS.Dingtalk,
    "taskNotifications.channels.dingtalk.title",
  )
  const handleWecomChannelToggle = createChannelToggle(
    TASK_NOTIFICATION_CHANNELS.Wecom,
    "taskNotifications.channels.wecom.title",
  )
  const handleNtfyChannelToggle = createChannelToggle(
    TASK_NOTIFICATION_CHANNELS.Ntfy,
    "taskNotifications.channels.ntfy.title",
  )
  const handleWebhookChannelToggle = createChannelToggle(
    TASK_NOTIFICATION_CHANNELS.Webhook,
    "taskNotifications.channels.webhook.title",
  )

  const handleTaskToggle = async (
    task: TaskNotificationTask,
    enabled: boolean,
  ) => {
    const result = await updateTaskNotifications({
      tasks: {
        [task]: enabled,
      } as DeepPartial<TaskNotificationTaskPreferences>,
    })
    showUpdateToast(result, t("taskNotifications.tasksLabel"))
  }

  const handleSiteAnnouncementToggle = async (enabled: boolean) => {
    const response = await updateSiteAnnouncementNotifications({
      notificationEnabled: enabled,
    })
    showUpdateToast(response, t("taskNotifications.siteAnnouncements.enable"))
  }

  const saveChannelDraftBeforeTest = async (
    channel: TaskNotificationChannel,
  ): Promise<boolean> => {
    switch (channel) {
      case TASK_NOTIFICATION_CHANNELS.Telegram:
        return (await telegram.commit()).ok
      case TASK_NOTIFICATION_CHANNELS.Feishu:
        return (await feishu.commit()).ok
      case TASK_NOTIFICATION_CHANNELS.Dingtalk:
        return (await dingtalk.commit()).ok
      case TASK_NOTIFICATION_CHANNELS.Wecom:
        return (await wecom.commit()).ok
      case TASK_NOTIFICATION_CHANNELS.Ntfy:
        return (await ntfy.commit()).ok
      case TASK_NOTIFICATION_CHANNELS.Webhook:
        return (await webhook.commit()).ok
      case TASK_NOTIFICATION_CHANNELS.Browser:
        return true
    }
  }

  const handleRequestPermission = async () => {
    setIsRequestingPermission(true)
    const wasGrantedBefore = permissionGranted === true
    try {
      const result = await requestPermissionDetailed(
        OPTIONAL_PERMISSION_IDS.Notifications,
      )
      const success = result.success
      trackOptionalPermissionRequestResult(
        OPTIONAL_PERMISSION_IDS.Notifications,
        {
          success,
          failureReason: result.failureReason
            ? result.failureReason
            : undefined,
          wasGrantedBefore,
          wasGrantedAfter: success || wasGrantedBefore,
        },
      )
      await refreshPermissionStatus()
      showResultToast({
        success,
        successFallback: t("taskNotifications.permission.requestSuccess"),
        errorFallback: t("taskNotifications.permission.requestFailed"),
      })
    } catch (error) {
      trackOptionalPermissionRequestResult(
        OPTIONAL_PERMISSION_IDS.Notifications,
        {
          success: false,
          failureReason: error,
          wasGrantedBefore,
          wasGrantedAfter: wasGrantedBefore,
        },
      )
      logger.warn("Failed to request notification permission", error)
      await refreshPermissionStatus()
      showResultToast({
        success: false,
        successFallback: t("taskNotifications.permission.requestSuccess"),
        errorFallback: t("taskNotifications.permission.requestFailed"),
      })
    } finally {
      setIsRequestingPermission(false)
    }
  }

  const handleSendTest = async (channel: TaskNotificationChannel) => {
    setTestingChannel(channel)
    try {
      const saved = await saveChannelDraftBeforeTest(channel)
      if (!saved) {
        throw new Error(t("messages.saveSettingsFailed"))
      }

      const response = await sendTaskNotificationMessage(
        TaskNotificationMessageTypes.Test,
        { channel },
      )
      showResultToast({
        success: response?.success === true,
        message: response?.success === false ? response.error : undefined,
        successFallback: t("taskNotifications.test.sent"),
        errorFallback: t("taskNotifications.test.failed"),
      })
    } catch (error) {
      logger.warn("Failed to send test task notification", error)
      showResultToast({
        success: false,
        message: getErrorMessage(error),
        errorFallback: t("taskNotifications.test.failed"),
      })
    } finally {
      setTestingChannel(null)
    }
  }

  const statusText =
    permissionGranted === null
      ? t("permissions.status.checking")
      : permissionGranted
        ? t("permissions.status.granted")
        : t("permissions.status.denied")
  const isAnyChannelTesting = testingChannel !== null
  const canSendBrowserTest =
    taskNotifications.enabled &&
    channels[TASK_NOTIFICATION_CHANNELS.Browser].enabled &&
    permissionGranted === true &&
    !isAnyChannelTesting
  const canSendTelegramTest =
    taskNotifications.enabled &&
    channels[TASK_NOTIFICATION_CHANNELS.Telegram].enabled &&
    Boolean(telegram.draft.botToken.trim()) &&
    Boolean(telegram.draft.chatId.trim()) &&
    !isAnyChannelTesting
  const canSendFeishuTest =
    taskNotifications.enabled &&
    channels[TASK_NOTIFICATION_CHANNELS.Feishu].enabled &&
    Boolean(feishu.draft.webhookKey.trim()) &&
    !isAnyChannelTesting
  const canSendDingtalkTest =
    taskNotifications.enabled &&
    channels[TASK_NOTIFICATION_CHANNELS.Dingtalk].enabled &&
    Boolean(dingtalk.draft.webhookKey.trim()) &&
    !isAnyChannelTesting
  const canSendWecomTest =
    taskNotifications.enabled &&
    channels[TASK_NOTIFICATION_CHANNELS.Wecom].enabled &&
    Boolean(wecom.draft.webhookKey.trim()) &&
    !isAnyChannelTesting
  const canSendNtfyTest =
    taskNotifications.enabled &&
    channels[TASK_NOTIFICATION_CHANNELS.Ntfy].enabled &&
    Boolean(ntfy.draft.topicUrl.trim()) &&
    !isAnyChannelTesting
  const canSendWebhookTest =
    taskNotifications.enabled &&
    channels[TASK_NOTIFICATION_CHANNELS.Webhook].enabled &&
    Boolean(webhook.draft.url.trim()) &&
    !isAnyChannelTesting
  const canResetEnablement =
    taskNotifications.enabled !== DEFAULT_TASK_NOTIFICATION_PREFERENCES.enabled
  const canResetChannels =
    !isAnyChannelTesting &&
    (!matchesDefaultSettings(
      channels,
      DEFAULT_TASK_NOTIFICATION_PREFERENCES.channels,
    ) ||
      [telegram, feishu, dingtalk, wecom, ntfy, webhook].some(
        (field) => field.isDirty,
      ))
  const canResetEvents =
    !matchesDefaultSettings(
      taskNotifications.tasks,
      DEFAULT_TASK_NOTIFICATION_PREFERENCES.tasks,
    ) ||
    siteAnnouncementNotifications.notificationEnabled !==
      DEFAULT_SITE_ANNOUNCEMENT_PREFERENCES.notificationEnabled
  const resetEnablement = () =>
    updateTaskNotifications({
      enabled: DEFAULT_TASK_NOTIFICATION_PREFERENCES.enabled,
    })
  const resetChannels = async () => {
    const result = await updateTaskNotifications({
      channels: DEFAULT_TASK_NOTIFICATION_PREFERENCES.channels,
    })
    if (result.ok) {
      const defaults = DEFAULT_TASK_NOTIFICATION_PREFERENCES.channels
      telegram.setDraft({
        botToken: defaults.telegram.botToken,
        chatId: defaults.telegram.chatId,
      })
      feishu.setDraft({ webhookKey: defaults.feishu.webhookKey })
      dingtalk.setDraft({
        webhookKey: defaults.dingtalk.webhookKey,
        secret: defaults.dingtalk.secret,
      })
      wecom.setDraft({ webhookKey: defaults.wecom.webhookKey })
      ntfy.setDraft({
        topicUrl: defaults.ntfy.topicUrl,
        accessToken: defaults.ntfy.accessToken,
      })
      webhook.setDraft({ url: defaults.webhook.url })
    }
    return result
  }

  const resetEvents = async () => {
    const result = await userPreferences.savePreferencesWithResult({
      taskNotifications: {
        tasks: DEFAULT_TASK_NOTIFICATION_PREFERENCES.tasks,
      },
      siteAnnouncementNotifications: {
        notificationEnabled:
          DEFAULT_SITE_ANNOUNCEMENT_PREFERENCES.notificationEnabled,
      },
    })
    if (result.ok) await loadPreferences()
    return result
  }

  return {
    canResetEnablement,
    canResetChannels,
    canResetEvents,
    resetEnablement,
    resetChannels,
    resetEvents,
    siteAnnouncementNotifications,
    taskNotifications,
    updateTaskNotifications,
    loadPreferences,
    permissionGranted,
    isRequestingPermission,
    testingChannel,
    channels,
    telegram,
    feishu,
    dingtalk,
    wecom,
    ntfy,
    webhook,
    handleGlobalToggle,
    handleBrowserChannelToggle,
    handleTelegramChannelToggle,
    handleFeishuChannelToggle,
    handleDingtalkChannelToggle,
    handleWecomChannelToggle,
    handleNtfyChannelToggle,
    handleWebhookChannelToggle,
    handleTaskToggle,
    handleSiteAnnouncementToggle,
    handleRequestPermission,
    handleSendTest,
    statusText,
    isAnyChannelTesting,
    canSendBrowserTest,
    canSendTelegramTest,
    canSendFeishuTest,
    canSendDingtalkTest,
    canSendWecomTest,
    canSendNtfyTest,
    canSendWebhookTest,
  }
}

export type TaskNotificationSettingsViewModel = ReturnType<
  typeof useTaskNotificationSettingsViewModel
>
