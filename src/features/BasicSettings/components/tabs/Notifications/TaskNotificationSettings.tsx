import type { TFunction } from "i18next"
import { Bell } from "lucide-react"
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { useTranslation } from "react-i18next"

import { SettingSection } from "~/components/SettingSection"
import {
  Badge,
  BodySmall,
  Button,
  Card,
  CardItem,
  CardList,
  FormField,
  Input,
  Label,
  Link,
  Separator,
  Switch,
} from "~/components/ui"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { BASIC_SETTINGS_TEST_IDS } from "~/features/BasicSettings/testIds"
import { useDeferredPreferenceDraft } from "~/hooks/useDeferredPreferenceDraft"
import { blurInputOnEnter } from "~/hooks/useDeferredPreferenceField"
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
import { trackOptionalPermissionRequestResult } from "~/services/productAnalytics/permissions"
import {
  TASK_NOTIFICATION_CHANNELS,
  TASK_NOTIFICATION_TASKS,
  type TaskNotificationChannel,
  type TaskNotificationChannelPreferences,
  type TaskNotificationTask,
  type TaskNotificationTaskPreferences,
} from "~/types/taskNotifications"
import type { DeepPartial } from "~/types/utils"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { showResultToast, showUpdateToast } from "~/utils/core/toastHelpers"
import {
  getDocsTaskNotificationsDingtalkUrl,
  getDocsTaskNotificationsFeishuUrl,
  getDocsTaskNotificationsNtfyUrl,
  getDocsTaskNotificationsWecomUrl,
} from "~/utils/navigation/docsLinks"

const logger = createLogger("TaskNotificationSettings")

const TASK_NOTIFICATION_ITEMS: Array<{
  task: TaskNotificationTask
}> = [
  { task: TASK_NOTIFICATION_TASKS.AutoCheckin },
  { task: TASK_NOTIFICATION_TASKS.WebdavAutoSync },
  { task: TASK_NOTIFICATION_TASKS.ManagedSiteModelSync },
  { task: TASK_NOTIFICATION_TASKS.UsageHistorySync },
  { task: TASK_NOTIFICATION_TASKS.BalanceHistoryCapture },
]

interface NotificationSettingItemProps {
  id: string
  title?: string
  description?: string
  actions?: ReactNode
  children?: ReactNode
}

/**
 * Renders a notification setting row with a stable action bar and optional full-width details.
 */
function NotificationSettingItem({
  id,
  title,
  description,
  actions,
  children,
}: NotificationSettingItemProps) {
  return (
    <CardItem id={id} className="items-stretch sm:items-stretch">
      <div className="w-full space-y-4">
        <div
          data-slot="notification-setting-content"
          className="flex flex-col gap-3 has-[>[data-slot=notification-setting-actions]>[data-slot=switch]]:flex-row has-[>[data-slot=notification-setting-actions]>[data-slot=switch]]:items-center has-[>[data-slot=notification-setting-actions]>[data-slot=switch]]:justify-between [@container(min-width:42rem)]:flex-row [@container(min-width:42rem)]:items-center [@container(min-width:42rem)]:justify-between"
        >
          <div className="min-w-0 flex-1 space-y-1">
            {title && (
              <Label className="text-base font-semibold tracking-tight">
                {title}
              </Label>
            )}
            {description && (
              <BodySmall className="dark:text-dark-text-tertiary font-normal text-gray-500">
                {description}
              </BodySmall>
            )}
          </div>
          {actions && (
            <div
              data-slot="notification-setting-actions"
              className="flex w-full flex-wrap items-center justify-end gap-3 has-[>[data-slot=switch]]:w-auto has-[>[data-slot=switch]]:shrink-0 [@container(min-width:42rem)]:w-auto [@container(min-width:42rem)]:shrink-0"
            >
              {actions}
            </div>
          )}
        </div>
        {children && (
          <div className="dark:bg-dark-bg-tertiary/20 dark:border-dark-bg-tertiary rounded-lg border border-gray-100 bg-gray-50/30 p-4">
            {children}
          </div>
        )}
      </div>
    </CardItem>
  )
}

interface NotificationChannelActionsProps {
  checked: boolean
  disabled: boolean
  loading: boolean
  testDisabled: boolean
  testLabel: string
  testButtonTestId?: string
  onToggle: (enabled: boolean) => void
  onTest: () => void
}

/**
 * Groups the channel test action and enable switch in a single horizontal control area.
 */
function NotificationChannelActions({
  checked,
  disabled,
  loading,
  testDisabled,
  testLabel,
  testButtonTestId,
  onToggle,
  onTest,
}: NotificationChannelActionsProps) {
  const { t: commonT } = useTranslation("common")

  return (
    <div className="flex items-center gap-4">
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-8 shadow-none"
        loading={loading}
        disabled={testDisabled}
        data-testid={testButtonTestId}
        onClick={onTest}
      >
        {loading ? commonT("status.testing") : testLabel}
      </Button>
      <Separator orientation="vertical" className="h-4" />
      <Switch checked={checked} disabled={disabled} onChange={onToggle} />
    </div>
  )
}

/**
 * Resolves the localized label for a task notification option.
 */
function getTaskLabel(t: TFunction<"settings">, task: TaskNotificationTask) {
  switch (task) {
    case TASK_NOTIFICATION_TASKS.AutoCheckin:
      return t("taskNotifications.tasks.autoCheckin")
    case TASK_NOTIFICATION_TASKS.WebdavAutoSync:
      return t("taskNotifications.tasks.webdavAutoSync")
    case TASK_NOTIFICATION_TASKS.ManagedSiteModelSync:
      return t("taskNotifications.tasks.managedSiteModelSync")
    case TASK_NOTIFICATION_TASKS.UsageHistorySync:
      return t("taskNotifications.tasks.usageHistorySync")
    case TASK_NOTIFICATION_TASKS.BalanceHistoryCapture:
      return t("taskNotifications.tasks.balanceHistoryCapture")
  }
}

/**
 * Resolves the localized description for a task notification option.
 */
function getTaskDescription(
  t: TFunction<"settings">,
  task: TaskNotificationTask,
) {
  switch (task) {
    case TASK_NOTIFICATION_TASKS.AutoCheckin:
      return t("taskNotifications.taskDescriptions.autoCheckin")
    case TASK_NOTIFICATION_TASKS.WebdavAutoSync:
      return t("taskNotifications.taskDescriptions.webdavAutoSync")
    case TASK_NOTIFICATION_TASKS.ManagedSiteModelSync:
      return t("taskNotifications.taskDescriptions.managedSiteModelSync")
    case TASK_NOTIFICATION_TASKS.UsageHistorySync:
      return t("taskNotifications.taskDescriptions.usageHistorySync")
    case TASK_NOTIFICATION_TASKS.BalanceHistoryCapture:
      return t("taskNotifications.taskDescriptions.balanceHistoryCapture")
  }
}

/**
 * General settings section for background scheduled-task system notifications.
 */
export default function TaskNotificationSettings() {
  const { i18n, t } = useTranslation(["settings", "common"])
  const {
    preferences,
    siteAnnouncementNotifications,
    taskNotifications,
    updateSiteAnnouncementNotifications,
    updateTaskNotifications,
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

  const handleBrowserChannelToggle = async (enabled: boolean) => {
    await handleChannelUpdate(
      {
        [TASK_NOTIFICATION_CHANNELS.Browser]: {
          enabled,
        },
      },
      t("taskNotifications.channels.browser.title"),
    )
  }

  const handleTelegramChannelToggle = async (enabled: boolean) => {
    await handleChannelUpdate(
      {
        [TASK_NOTIFICATION_CHANNELS.Telegram]: {
          enabled,
        },
      },
      t("taskNotifications.channels.telegram.title"),
    )
  }

  const handleFeishuChannelToggle = async (enabled: boolean) => {
    await handleChannelUpdate(
      {
        [TASK_NOTIFICATION_CHANNELS.Feishu]: {
          enabled,
        },
      },
      t("taskNotifications.channels.feishu.title"),
    )
  }

  const handleDingtalkChannelToggle = async (enabled: boolean) => {
    await handleChannelUpdate(
      {
        [TASK_NOTIFICATION_CHANNELS.Dingtalk]: {
          enabled,
        },
      },
      t("taskNotifications.channels.dingtalk.title"),
    )
  }

  const handleWecomChannelToggle = async (enabled: boolean) => {
    await handleChannelUpdate(
      {
        [TASK_NOTIFICATION_CHANNELS.Wecom]: {
          enabled,
        },
      },
      t("taskNotifications.channels.wecom.title"),
    )
  }

  const handleNtfyChannelToggle = async (enabled: boolean) => {
    await handleChannelUpdate(
      {
        [TASK_NOTIFICATION_CHANNELS.Ntfy]: {
          enabled,
        },
      },
      t("taskNotifications.channels.ntfy.title"),
    )
  }

  const handleWebhookChannelToggle = async (enabled: boolean) => {
    await handleChannelUpdate(
      {
        [TASK_NOTIFICATION_CHANNELS.Webhook]: {
          enabled,
        },
      },
      t("taskNotifications.channels.webhook.title"),
    )
  }

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
      showResultToast(
        success,
        t("taskNotifications.permission.requestSuccess"),
        t("taskNotifications.permission.requestFailed"),
      )
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
      showResultToast(
        false,
        t("taskNotifications.permission.requestSuccess"),
        t("taskNotifications.permission.requestFailed"),
      )
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
  const feishuDocsUrl = getDocsTaskNotificationsFeishuUrl(i18n.language)
  const dingtalkDocsUrl = getDocsTaskNotificationsDingtalkUrl(i18n.language)
  const wecomDocsUrl = getDocsTaskNotificationsWecomUrl(i18n.language)
  const ntfyDocsUrl = getDocsTaskNotificationsNtfyUrl(i18n.language)

  return (
    <div className="space-y-6">
      <SettingSection
        id={SETTINGS_ANCHORS.TASK_NOTIFICATIONS}
        title={t("taskNotifications.groups.setup.title")}
        description={t("taskNotifications.groups.setup.description")}
      >
        <Card padding="none">
          <CardList>
            <CardItem
              id={SETTINGS_ANCHORS.TASK_NOTIFICATIONS_ENABLED}
              icon={
                <Bell className="h-5 w-5 text-teal-600 dark:text-teal-400" />
              }
              title={t("taskNotifications.enable")}
              description={t("taskNotifications.enableDesc")}
              rightContent={
                <Switch
                  checked={taskNotifications.enabled}
                  onChange={handleGlobalToggle}
                />
              }
            />
          </CardList>
        </Card>
      </SettingSection>

      <SettingSection
        id={SETTINGS_ANCHORS.TASK_NOTIFICATION_CHANNELS}
        title={t("taskNotifications.groups.channels.title")}
        description={t("taskNotifications.groups.channels.description")}
      >
        <Card padding="none">
          <CardList>
            <NotificationSettingItem
              id={SETTINGS_ANCHORS.TASK_NOTIFICATIONS_PERMISSION}
              title={t("taskNotifications.permission.title")}
              description={t("taskNotifications.permission.description")}
              actions={
                <div className="flex items-center gap-3">
                  {!permissionGranted && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 shadow-none"
                      loading={isRequestingPermission}
                      data-testid={
                        BASIC_SETTINGS_TEST_IDS.taskNotificationsPermissionGrantButton
                      }
                      onClick={() => void handleRequestPermission()}
                    >
                      {isRequestingPermission
                        ? t("common:status.applying")
                        : t("taskNotifications.permission.request")}
                    </Button>
                  )}
                  {permissionGranted !== null && (
                    <>
                      {!permissionGranted && (
                        <div className="dark:bg-dark-bg-tertiary h-4 w-px bg-gray-200" />
                      )}
                      <Badge
                        variant={permissionGranted ? "success" : "secondary"}
                      >
                        {statusText}
                      </Badge>
                    </>
                  )}
                </div>
              }
            />

            <NotificationSettingItem
              id={SETTINGS_ANCHORS.TASK_NOTIFICATIONS_CHANNEL_BROWSER}
              title={t("taskNotifications.channels.browser.title")}
              description={t("taskNotifications.channels.browser.description")}
              actions={
                <NotificationChannelActions
                  checked={channels[TASK_NOTIFICATION_CHANNELS.Browser].enabled}
                  disabled={!taskNotifications.enabled}
                  loading={
                    testingChannel === TASK_NOTIFICATION_CHANNELS.Browser
                  }
                  testDisabled={!canSendBrowserTest}
                  testLabel={t("taskNotifications.test.action")}
                  testButtonTestId={
                    BASIC_SETTINGS_TEST_IDS.taskNotificationsBrowserTestButton
                  }
                  onToggle={(enabled) =>
                    void handleBrowserChannelToggle(enabled)
                  }
                  onTest={() =>
                    void handleSendTest(TASK_NOTIFICATION_CHANNELS.Browser)
                  }
                />
              }
            />

            <NotificationSettingItem
              id={SETTINGS_ANCHORS.TASK_NOTIFICATIONS_CHANNEL_TELEGRAM}
              title={t("taskNotifications.channels.telegram.title")}
              description={t("taskNotifications.channels.telegram.description")}
              actions={
                <NotificationChannelActions
                  checked={
                    channels[TASK_NOTIFICATION_CHANNELS.Telegram].enabled
                  }
                  disabled={!taskNotifications.enabled}
                  loading={
                    testingChannel === TASK_NOTIFICATION_CHANNELS.Telegram
                  }
                  testDisabled={!canSendTelegramTest}
                  testLabel={t("taskNotifications.test.action")}
                  onToggle={(enabled) =>
                    void handleTelegramChannelToggle(enabled)
                  }
                  onTest={() =>
                    void handleSendTest(TASK_NOTIFICATION_CHANNELS.Telegram)
                  }
                />
              }
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField
                  label={t("taskNotifications.channels.telegram.botToken")}
                  htmlFor={
                    SETTINGS_ANCHORS.TASK_NOTIFICATIONS_TELEGRAM_BOT_TOKEN
                  }
                >
                  <Input
                    id={SETTINGS_ANCHORS.TASK_NOTIFICATIONS_TELEGRAM_BOT_TOKEN}
                    type="password"
                    revealable
                    revealLabels={{
                      show: t("keyManagement:actions.showKey"),
                      hide: t("keyManagement:actions.hideKey"),
                    }}
                    value={telegram.draft.botToken}
                    disabled={
                      !taskNotifications.enabled ||
                      !channels[TASK_NOTIFICATION_CHANNELS.Telegram].enabled ||
                      telegram.isCommitting
                    }
                    placeholder={t(
                      "taskNotifications.channels.telegram.botTokenPlaceholder",
                    )}
                    onChange={(event) =>
                      telegram.setDraft((draft) => ({
                        ...draft,
                        botToken: event.target.value,
                      }))
                    }
                    onBlur={() => void telegram.commit()}
                    onKeyDown={blurInputOnEnter}
                  />
                </FormField>
                <FormField
                  label={t("taskNotifications.channels.telegram.chatId")}
                  htmlFor={SETTINGS_ANCHORS.TASK_NOTIFICATIONS_TELEGRAM_CHAT_ID}
                >
                  <Input
                    id={SETTINGS_ANCHORS.TASK_NOTIFICATIONS_TELEGRAM_CHAT_ID}
                    value={telegram.draft.chatId}
                    disabled={
                      !taskNotifications.enabled ||
                      !channels[TASK_NOTIFICATION_CHANNELS.Telegram].enabled ||
                      telegram.isCommitting
                    }
                    placeholder={t(
                      "taskNotifications.channels.telegram.chatIdPlaceholder",
                    )}
                    onChange={(event) =>
                      telegram.setDraft((draft) => ({
                        ...draft,
                        chatId: event.target.value,
                      }))
                    }
                    onBlur={() => void telegram.commit()}
                    onKeyDown={blurInputOnEnter}
                  />
                </FormField>
              </div>
            </NotificationSettingItem>

            <NotificationSettingItem
              id={SETTINGS_ANCHORS.TASK_NOTIFICATIONS_CHANNEL_FEISHU}
              title={t("taskNotifications.channels.feishu.title")}
              description={t("taskNotifications.channels.feishu.description")}
              actions={
                <NotificationChannelActions
                  checked={channels[TASK_NOTIFICATION_CHANNELS.Feishu].enabled}
                  disabled={!taskNotifications.enabled}
                  loading={testingChannel === TASK_NOTIFICATION_CHANNELS.Feishu}
                  testDisabled={!canSendFeishuTest}
                  testLabel={t("taskNotifications.test.action")}
                  onToggle={(enabled) =>
                    void handleFeishuChannelToggle(enabled)
                  }
                  onTest={() =>
                    void handleSendTest(TASK_NOTIFICATION_CHANNELS.Feishu)
                  }
                />
              }
            >
              <FormField
                label={t("taskNotifications.channels.feishu.webhookKey")}
                htmlFor={SETTINGS_ANCHORS.TASK_NOTIFICATIONS_FEISHU_WEBHOOK_KEY}
              >
                <Input
                  id={SETTINGS_ANCHORS.TASK_NOTIFICATIONS_FEISHU_WEBHOOK_KEY}
                  type="password"
                  revealable
                  revealLabels={{
                    show: t("keyManagement:actions.showKey"),
                    hide: t("keyManagement:actions.hideKey"),
                  }}
                  value={feishu.draft.webhookKey}
                  disabled={
                    !taskNotifications.enabled ||
                    !channels[TASK_NOTIFICATION_CHANNELS.Feishu].enabled ||
                    feishu.isCommitting
                  }
                  placeholder={t(
                    "taskNotifications.channels.feishu.webhookKeyPlaceholder",
                  )}
                  onChange={(event) =>
                    feishu.setDraft((draft) => ({
                      ...draft,
                      webhookKey: event.target.value,
                    }))
                  }
                  onBlur={() => void feishu.commit()}
                  onKeyDown={blurInputOnEnter}
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {t("taskNotifications.channels.feishu.webhookKeyDescription")}{" "}
                  <Link
                    href={feishuDocsUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-xs"
                  >
                    {t("taskNotifications.channels.feishu.docsLink")}
                  </Link>
                </p>
              </FormField>
            </NotificationSettingItem>

            <NotificationSettingItem
              id={SETTINGS_ANCHORS.TASK_NOTIFICATIONS_CHANNEL_DINGTALK}
              title={t("taskNotifications.channels.dingtalk.title")}
              description={t("taskNotifications.channels.dingtalk.description")}
              actions={
                <NotificationChannelActions
                  checked={
                    channels[TASK_NOTIFICATION_CHANNELS.Dingtalk].enabled
                  }
                  disabled={!taskNotifications.enabled}
                  loading={
                    testingChannel === TASK_NOTIFICATION_CHANNELS.Dingtalk
                  }
                  testDisabled={!canSendDingtalkTest}
                  testLabel={t("taskNotifications.test.action")}
                  onToggle={(enabled) =>
                    void handleDingtalkChannelToggle(enabled)
                  }
                  onTest={() =>
                    void handleSendTest(TASK_NOTIFICATION_CHANNELS.Dingtalk)
                  }
                />
              }
            >
              <div className="space-y-3">
                <div className="grid gap-3 [@container(min-width:42rem)]:grid-cols-2">
                  <FormField
                    label={t("taskNotifications.channels.dingtalk.webhookKey")}
                    htmlFor={
                      SETTINGS_ANCHORS.TASK_NOTIFICATIONS_DINGTALK_WEBHOOK_KEY
                    }
                  >
                    <Input
                      id={
                        SETTINGS_ANCHORS.TASK_NOTIFICATIONS_DINGTALK_WEBHOOK_KEY
                      }
                      type="password"
                      revealable
                      revealLabels={{
                        show: t("keyManagement:actions.showKey"),
                        hide: t("keyManagement:actions.hideKey"),
                      }}
                      value={dingtalk.draft.webhookKey}
                      disabled={
                        !taskNotifications.enabled ||
                        !channels[TASK_NOTIFICATION_CHANNELS.Dingtalk]
                          .enabled ||
                        dingtalk.isCommitting
                      }
                      placeholder={t(
                        "taskNotifications.channels.dingtalk.webhookKeyPlaceholder",
                      )}
                      onChange={(event) =>
                        dingtalk.setDraft((draft) => ({
                          ...draft,
                          webhookKey: event.target.value,
                        }))
                      }
                      onBlur={() => void dingtalk.commit()}
                      onKeyDown={blurInputOnEnter}
                    />
                  </FormField>
                  <FormField
                    label={t("taskNotifications.channels.dingtalk.secret")}
                    htmlFor={
                      SETTINGS_ANCHORS.TASK_NOTIFICATIONS_DINGTALK_SECRET
                    }
                  >
                    <Input
                      id={SETTINGS_ANCHORS.TASK_NOTIFICATIONS_DINGTALK_SECRET}
                      type="password"
                      revealable
                      revealLabels={{
                        show: t("keyManagement:actions.showKey"),
                        hide: t("keyManagement:actions.hideKey"),
                      }}
                      value={dingtalk.draft.secret}
                      disabled={
                        !taskNotifications.enabled ||
                        !channels[TASK_NOTIFICATION_CHANNELS.Dingtalk]
                          .enabled ||
                        dingtalk.isCommitting
                      }
                      placeholder={t(
                        "taskNotifications.channels.dingtalk.secretPlaceholder",
                      )}
                      onChange={(event) =>
                        dingtalk.setDraft((draft) => ({
                          ...draft,
                          secret: event.target.value,
                        }))
                      }
                      onBlur={() => void dingtalk.commit()}
                      onKeyDown={blurInputOnEnter}
                    />
                  </FormField>
                </div>
                <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                  {t(
                    "taskNotifications.channels.dingtalk.webhookKeyDescription",
                  )}{" "}
                  <Link
                    href={dingtalkDocsUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-xs"
                  >
                    {t("taskNotifications.channels.dingtalk.docsLink")}
                  </Link>
                </p>
              </div>
            </NotificationSettingItem>

            <NotificationSettingItem
              id={SETTINGS_ANCHORS.TASK_NOTIFICATIONS_CHANNEL_WECOM}
              title={t("taskNotifications.channels.wecom.title")}
              description={t("taskNotifications.channels.wecom.description")}
              actions={
                <NotificationChannelActions
                  checked={channels[TASK_NOTIFICATION_CHANNELS.Wecom].enabled}
                  disabled={!taskNotifications.enabled}
                  loading={testingChannel === TASK_NOTIFICATION_CHANNELS.Wecom}
                  testDisabled={!canSendWecomTest}
                  testLabel={t("taskNotifications.test.action")}
                  onToggle={(enabled) => void handleWecomChannelToggle(enabled)}
                  onTest={() =>
                    void handleSendTest(TASK_NOTIFICATION_CHANNELS.Wecom)
                  }
                />
              }
            >
              <FormField
                label={t("taskNotifications.channels.wecom.webhookKey")}
                htmlFor={SETTINGS_ANCHORS.TASK_NOTIFICATIONS_WECOM_WEBHOOK_KEY}
              >
                <Input
                  id={SETTINGS_ANCHORS.TASK_NOTIFICATIONS_WECOM_WEBHOOK_KEY}
                  type="password"
                  revealable
                  revealLabels={{
                    show: t("keyManagement:actions.showKey"),
                    hide: t("keyManagement:actions.hideKey"),
                  }}
                  value={wecom.draft.webhookKey}
                  disabled={
                    !taskNotifications.enabled ||
                    !channels[TASK_NOTIFICATION_CHANNELS.Wecom].enabled ||
                    wecom.isCommitting
                  }
                  placeholder={t(
                    "taskNotifications.channels.wecom.webhookKeyPlaceholder",
                  )}
                  onChange={(event) =>
                    wecom.setDraft((draft) => ({
                      ...draft,
                      webhookKey: event.target.value,
                    }))
                  }
                  onBlur={() => void wecom.commit()}
                  onKeyDown={blurInputOnEnter}
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {t("taskNotifications.channels.wecom.webhookKeyDescription")}{" "}
                  <Link
                    href={wecomDocsUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-xs"
                  >
                    {t("taskNotifications.channels.wecom.docsLink")}
                  </Link>
                </p>
              </FormField>
            </NotificationSettingItem>

            <NotificationSettingItem
              id={SETTINGS_ANCHORS.TASK_NOTIFICATIONS_CHANNEL_NTFY}
              title={t("taskNotifications.channels.ntfy.title")}
              description={t("taskNotifications.channels.ntfy.description")}
              actions={
                <NotificationChannelActions
                  checked={channels[TASK_NOTIFICATION_CHANNELS.Ntfy].enabled}
                  disabled={!taskNotifications.enabled}
                  loading={testingChannel === TASK_NOTIFICATION_CHANNELS.Ntfy}
                  testDisabled={!canSendNtfyTest}
                  testLabel={t("taskNotifications.test.action")}
                  onToggle={(enabled) => void handleNtfyChannelToggle(enabled)}
                  onTest={() =>
                    void handleSendTest(TASK_NOTIFICATION_CHANNELS.Ntfy)
                  }
                />
              }
            >
              <div className="space-y-3">
                <div className="grid gap-3 [@container(min-width:42rem)]:grid-cols-2">
                  <FormField
                    label={t("taskNotifications.channels.ntfy.topicUrl")}
                    htmlFor={SETTINGS_ANCHORS.TASK_NOTIFICATIONS_NTFY_TOPIC_URL}
                  >
                    <Input
                      id={SETTINGS_ANCHORS.TASK_NOTIFICATIONS_NTFY_TOPIC_URL}
                      value={ntfy.draft.topicUrl}
                      disabled={
                        !taskNotifications.enabled ||
                        !channels[TASK_NOTIFICATION_CHANNELS.Ntfy].enabled ||
                        ntfy.isCommitting
                      }
                      placeholder={t(
                        "taskNotifications.channels.ntfy.topicUrlPlaceholder",
                      )}
                      onChange={(event) =>
                        ntfy.setDraft((draft) => ({
                          ...draft,
                          topicUrl: event.target.value,
                        }))
                      }
                      onBlur={() => void ntfy.commit()}
                      onKeyDown={blurInputOnEnter}
                    />
                  </FormField>
                  <FormField
                    label={t("taskNotifications.channels.ntfy.accessToken")}
                    htmlFor={
                      SETTINGS_ANCHORS.TASK_NOTIFICATIONS_NTFY_ACCESS_TOKEN
                    }
                  >
                    <Input
                      id={SETTINGS_ANCHORS.TASK_NOTIFICATIONS_NTFY_ACCESS_TOKEN}
                      type="password"
                      revealable
                      revealLabels={{
                        show: t("keyManagement:actions.showKey"),
                        hide: t("keyManagement:actions.hideKey"),
                      }}
                      value={ntfy.draft.accessToken}
                      disabled={
                        !taskNotifications.enabled ||
                        !channels[TASK_NOTIFICATION_CHANNELS.Ntfy].enabled ||
                        ntfy.isCommitting
                      }
                      placeholder={t(
                        "taskNotifications.channels.ntfy.accessTokenPlaceholder",
                      )}
                      onChange={(event) =>
                        ntfy.setDraft((draft) => ({
                          ...draft,
                          accessToken: event.target.value,
                        }))
                      }
                      onBlur={() => void ntfy.commit()}
                      onKeyDown={blurInputOnEnter}
                    />
                  </FormField>
                </div>
                <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                  {t("taskNotifications.channels.ntfy.topicUrlDescription")}{" "}
                  <Link
                    href={ntfyDocsUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-xs"
                  >
                    {t("taskNotifications.channels.ntfy.docsLink")}
                  </Link>
                </p>
              </div>
            </NotificationSettingItem>

            <NotificationSettingItem
              id={SETTINGS_ANCHORS.TASK_NOTIFICATIONS_CHANNEL_WEBHOOK}
              title={t("taskNotifications.channels.webhook.title")}
              description={t("taskNotifications.channels.webhook.description")}
              actions={
                <NotificationChannelActions
                  checked={channels[TASK_NOTIFICATION_CHANNELS.Webhook].enabled}
                  disabled={!taskNotifications.enabled}
                  loading={
                    testingChannel === TASK_NOTIFICATION_CHANNELS.Webhook
                  }
                  testDisabled={!canSendWebhookTest}
                  testLabel={t("taskNotifications.test.action")}
                  onToggle={(enabled) =>
                    void handleWebhookChannelToggle(enabled)
                  }
                  onTest={() =>
                    void handleSendTest(TASK_NOTIFICATION_CHANNELS.Webhook)
                  }
                />
              }
            >
              <FormField
                label={t("taskNotifications.channels.webhook.url")}
                htmlFor={SETTINGS_ANCHORS.TASK_NOTIFICATIONS_WEBHOOK_URL}
              >
                <Input
                  id={SETTINGS_ANCHORS.TASK_NOTIFICATIONS_WEBHOOK_URL}
                  value={webhook.draft.url}
                  disabled={
                    !taskNotifications.enabled ||
                    !channels[TASK_NOTIFICATION_CHANNELS.Webhook].enabled ||
                    webhook.isCommitting
                  }
                  placeholder={t(
                    "taskNotifications.channels.webhook.urlPlaceholder",
                  )}
                  onChange={(event) =>
                    webhook.setDraft((draft) => ({
                      ...draft,
                      url: event.target.value,
                    }))
                  }
                  onBlur={() => void webhook.commit()}
                  onKeyDown={blurInputOnEnter}
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {t("taskNotifications.channels.webhook.urlDescription")}
                </p>
              </FormField>
            </NotificationSettingItem>
          </CardList>
        </Card>
      </SettingSection>

      <SettingSection
        id={SETTINGS_ANCHORS.TASK_NOTIFICATION_EVENTS}
        title={t("taskNotifications.groups.tasks.title")}
        description={t("taskNotifications.groups.tasks.description")}
      >
        <Card padding="none">
          <CardList>
            {TASK_NOTIFICATION_ITEMS.map((item) => (
              <NotificationSettingItem
                key={item.task}
                id={`task-notifications-${item.task}`}
                title={getTaskLabel(t, item.task)}
                description={getTaskDescription(t, item.task)}
                actions={
                  <Switch
                    checked={taskNotifications.tasks[item.task]}
                    disabled={!taskNotifications.enabled}
                    onChange={(enabled) =>
                      void handleTaskToggle(item.task, enabled)
                    }
                  />
                }
              />
            ))}
            <NotificationSettingItem
              id={SETTINGS_ANCHORS.TASK_NOTIFICATIONS_SITE_ANNOUNCEMENTS}
              title={t("taskNotifications.siteAnnouncements.enable")}
              description={t("taskNotifications.siteAnnouncements.enableDesc")}
              actions={
                <Switch
                  checked={siteAnnouncementNotifications.notificationEnabled}
                  onChange={handleSiteAnnouncementToggle}
                />
              }
            />
          </CardList>
        </Card>
      </SettingSection>
    </div>
  )
}
