import { BellIcon } from "@heroicons/react/24/outline"
import type { TFunction } from "i18next"
import { useCallback, useEffect, useState, type ReactNode } from "react"
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
  Separator,
  Switch,
} from "~/components/ui"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import {
  hasPermission,
  onOptionalPermissionsChanged,
  OPTIONAL_PERMISSION_IDS,
  requestPermission,
} from "~/services/permissions/permissionManager"
import {
  TASK_NOTIFICATION_CHANNELS,
  TASK_NOTIFICATION_TASKS,
  type TaskNotificationChannel,
  type TaskNotificationChannelPreferences,
  type TaskNotificationTask,
} from "~/types/taskNotifications"
import { sendRuntimeMessage } from "~/utils/browser/browserApi"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { showResultToast, showUpdateToast } from "~/utils/core/toastHelpers"

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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
            <div className="flex items-center gap-3 sm:shrink-0">{actions}</div>
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
  onToggle,
  onTest,
}: NotificationChannelActionsProps) {
  return (
    <div className="flex items-center gap-4">
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-8 shadow-none"
        loading={loading}
        disabled={testDisabled}
        onClick={onTest}
      >
        {testLabel}
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
  const { t } = useTranslation("settings")
  const {
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
  const [telegramDraft, setTelegramDraft] = useState(
    channels[TASK_NOTIFICATION_CHANNELS.Telegram],
  )
  const [webhookDraft, setWebhookDraft] = useState(
    channels[TASK_NOTIFICATION_CHANNELS.Webhook],
  )

  const refreshPermissionStatus = useCallback(async () => {
    const granted = await hasPermission(OPTIONAL_PERMISSION_IDS.Notifications)
    setPermissionGranted(granted)
  }, [])

  useEffect(() => {
    setTelegramDraft(
      taskNotifications.channels[TASK_NOTIFICATION_CHANNELS.Telegram],
    )
    setWebhookDraft(
      taskNotifications.channels[TASK_NOTIFICATION_CHANNELS.Webhook],
    )
  }, [taskNotifications.channels])

  useEffect(() => {
    void refreshPermissionStatus()
    const unsubscribe = onOptionalPermissionsChanged(() => {
      void refreshPermissionStatus()
    })
    return unsubscribe
  }, [refreshPermissionStatus])

  const handleGlobalToggle = async (enabled: boolean) => {
    const success = await updateTaskNotifications({ enabled })
    showUpdateToast(success, t("taskNotifications.enable"))
  }

  const handleChannelUpdate = async (
    channels: TaskNotificationChannelPreferences,
    label: string,
  ) => {
    const success = await updateTaskNotifications({ channels })
    showUpdateToast(success, label)
    return success
  }

  const handleBrowserChannelToggle = async (enabled: boolean) => {
    await handleChannelUpdate(
      {
        ...channels,
        [TASK_NOTIFICATION_CHANNELS.Browser]: {
          ...channels[TASK_NOTIFICATION_CHANNELS.Browser],
          enabled,
        },
      },
      t("taskNotifications.channels.browser.title"),
    )
  }

  const handleTelegramChannelToggle = async (enabled: boolean) => {
    await handleChannelUpdate(
      {
        ...channels,
        [TASK_NOTIFICATION_CHANNELS.Telegram]: {
          ...channels[TASK_NOTIFICATION_CHANNELS.Telegram],
          enabled,
        },
      },
      t("taskNotifications.channels.telegram.title"),
    )
  }

  const handleWebhookChannelToggle = async (enabled: boolean) => {
    await handleChannelUpdate(
      {
        ...channels,
        [TASK_NOTIFICATION_CHANNELS.Webhook]: {
          ...channels[TASK_NOTIFICATION_CHANNELS.Webhook],
          enabled,
        },
      },
      t("taskNotifications.channels.webhook.title"),
    )
  }

  const handleTelegramConfigSave = async () => {
    const nextTelegram = {
      ...channels[TASK_NOTIFICATION_CHANNELS.Telegram],
      botToken: telegramDraft.botToken.trim(),
      chatId: telegramDraft.chatId.trim(),
    }
    const currentTelegram = channels[TASK_NOTIFICATION_CHANNELS.Telegram]
    if (
      nextTelegram.botToken === currentTelegram.botToken &&
      nextTelegram.chatId === currentTelegram.chatId
    ) {
      return
    }

    await handleChannelUpdate(
      {
        ...channels,
        [TASK_NOTIFICATION_CHANNELS.Telegram]: nextTelegram,
      },
      t("taskNotifications.channels.telegram.title"),
    )
  }

  const handleWebhookConfigSave = async () => {
    const nextWebhook = {
      ...channels[TASK_NOTIFICATION_CHANNELS.Webhook],
      url: webhookDraft.url.trim(),
    }
    if (nextWebhook.url === channels[TASK_NOTIFICATION_CHANNELS.Webhook].url) {
      return
    }

    await handleChannelUpdate(
      {
        ...channels,
        [TASK_NOTIFICATION_CHANNELS.Webhook]: nextWebhook,
      },
      t("taskNotifications.channels.webhook.title"),
    )
  }

  const handleTaskToggle = async (
    task: TaskNotificationTask,
    enabled: boolean,
  ) => {
    const success = await updateTaskNotifications({
      tasks: {
        ...taskNotifications.tasks,
        [task]: enabled,
      },
    })
    showUpdateToast(success, t("taskNotifications.tasksLabel"))
  }

  const handleSiteAnnouncementToggle = async (enabled: boolean) => {
    const success = await updateSiteAnnouncementNotifications({
      notificationEnabled: enabled,
    })
    showUpdateToast(success, t("taskNotifications.siteAnnouncements.enable"))
  }

  const handleRequestPermission = async () => {
    setIsRequestingPermission(true)
    try {
      const success = await requestPermission(
        OPTIONAL_PERMISSION_IDS.Notifications,
      )
      await refreshPermissionStatus()
      showResultToast(
        success,
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
      const response = await sendRuntimeMessage({
        action: RuntimeActionIds.TaskNotificationsTest,
        channel,
      })
      showResultToast({
        success: response?.success === true,
        message: response?.error,
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
    Boolean(channels[TASK_NOTIFICATION_CHANNELS.Telegram].botToken.trim()) &&
    Boolean(channels[TASK_NOTIFICATION_CHANNELS.Telegram].chatId.trim()) &&
    !isAnyChannelTesting
  const canSendWebhookTest =
    taskNotifications.enabled &&
    channels[TASK_NOTIFICATION_CHANNELS.Webhook].enabled &&
    Boolean(channels[TASK_NOTIFICATION_CHANNELS.Webhook].url.trim()) &&
    !isAnyChannelTesting

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
                <BellIcon className="h-5 w-5 text-teal-600 dark:text-teal-400" />
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
                      onClick={() => void handleRequestPermission()}
                    >
                      {t("taskNotifications.permission.request")}
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
                    value={telegramDraft.botToken}
                    disabled={
                      !taskNotifications.enabled ||
                      !channels[TASK_NOTIFICATION_CHANNELS.Telegram].enabled
                    }
                    placeholder={t(
                      "taskNotifications.channels.telegram.botTokenPlaceholder",
                    )}
                    onChange={(event) =>
                      setTelegramDraft((draft) => ({
                        ...draft,
                        botToken: event.target.value,
                      }))
                    }
                    onBlur={() => void handleTelegramConfigSave()}
                  />
                </FormField>
                <FormField
                  label={t("taskNotifications.channels.telegram.chatId")}
                  htmlFor={SETTINGS_ANCHORS.TASK_NOTIFICATIONS_TELEGRAM_CHAT_ID}
                >
                  <Input
                    id={SETTINGS_ANCHORS.TASK_NOTIFICATIONS_TELEGRAM_CHAT_ID}
                    value={telegramDraft.chatId}
                    disabled={
                      !taskNotifications.enabled ||
                      !channels[TASK_NOTIFICATION_CHANNELS.Telegram].enabled
                    }
                    placeholder={t(
                      "taskNotifications.channels.telegram.chatIdPlaceholder",
                    )}
                    onChange={(event) =>
                      setTelegramDraft((draft) => ({
                        ...draft,
                        chatId: event.target.value,
                      }))
                    }
                    onBlur={() => void handleTelegramConfigSave()}
                  />
                </FormField>
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
                  value={webhookDraft.url}
                  disabled={
                    !taskNotifications.enabled ||
                    !channels[TASK_NOTIFICATION_CHANNELS.Webhook].enabled
                  }
                  placeholder={t(
                    "taskNotifications.channels.webhook.urlPlaceholder",
                  )}
                  onChange={(event) =>
                    setWebhookDraft((draft) => ({
                      ...draft,
                      url: event.target.value,
                    }))
                  }
                  onBlur={() => void handleWebhookConfigSave()}
                />
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
