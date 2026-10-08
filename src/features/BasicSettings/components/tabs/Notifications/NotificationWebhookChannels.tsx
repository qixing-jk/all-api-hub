import { useTranslation } from "react-i18next"

import { FormField, Input, Link } from "~/components/ui"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import type { TaskNotificationSettingsViewModel } from "~/features/BasicSettings/hooks/useTaskNotificationSettingsViewModel"
import { blurInputOnEnter } from "~/hooks/preferences/useDeferredPreferenceField"
import { TASK_NOTIFICATION_CHANNELS } from "~/types/taskNotifications"
import {
  getDocsTaskNotificationsDingtalkUrl,
  getDocsTaskNotificationsFeishuUrl,
  getDocsTaskNotificationsWecomUrl,
} from "~/utils/navigation/docsLinks"

import {
  NotificationChannelActions,
  NotificationSettingItem,
} from "./NotificationSettingItem"

/** Presents channel-specific credentials and delivery controls using the shared draft owner. */
export function NotificationWebhookChannels({
  model,
}: {
  model: TaskNotificationSettingsViewModel
}) {
  const { i18n, t } = useTranslation(["settings", "common"])
  const {
    taskNotifications,
    testingChannel,
    channels,
    feishu,
    dingtalk,
    wecom,
    handleFeishuChannelToggle,
    handleDingtalkChannelToggle,
    handleWecomChannelToggle,
    handleSendTest,
    canSendFeishuTest,
    canSendDingtalkTest,
    canSendWecomTest,
  } = model
  const feishuDocsUrl = getDocsTaskNotificationsFeishuUrl(i18n.language)
  const dingtalkDocsUrl = getDocsTaskNotificationsDingtalkUrl(i18n.language)
  const wecomDocsUrl = getDocsTaskNotificationsWecomUrl(i18n.language)
  return (
    <>
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
            onToggle={(enabled) => void handleFeishuChannelToggle(enabled)}
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
          <p className="text-muted-foreground text-xs">
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
            checked={channels[TASK_NOTIFICATION_CHANNELS.Dingtalk].enabled}
            disabled={!taskNotifications.enabled}
            loading={testingChannel === TASK_NOTIFICATION_CHANNELS.Dingtalk}
            testDisabled={!canSendDingtalkTest}
            testLabel={t("taskNotifications.test.action")}
            onToggle={(enabled) => void handleDingtalkChannelToggle(enabled)}
            onTest={() =>
              void handleSendTest(TASK_NOTIFICATION_CHANNELS.Dingtalk)
            }
          />
        }
      >
        <div className="space-y-density-3">
          <div className="gap-y-density-3 grid gap-x-3 [@container(min-width:42rem)]:grid-cols-2">
            <FormField
              label={t("taskNotifications.channels.dingtalk.webhookKey")}
              htmlFor={SETTINGS_ANCHORS.TASK_NOTIFICATIONS_DINGTALK_WEBHOOK_KEY}
            >
              <Input
                id={SETTINGS_ANCHORS.TASK_NOTIFICATIONS_DINGTALK_WEBHOOK_KEY}
                type="password"
                revealable
                revealLabels={{
                  show: t("keyManagement:actions.showKey"),
                  hide: t("keyManagement:actions.hideKey"),
                }}
                value={dingtalk.draft.webhookKey}
                disabled={
                  !taskNotifications.enabled ||
                  !channels[TASK_NOTIFICATION_CHANNELS.Dingtalk].enabled ||
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
              htmlFor={SETTINGS_ANCHORS.TASK_NOTIFICATIONS_DINGTALK_SECRET}
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
                  !channels[TASK_NOTIFICATION_CHANNELS.Dingtalk].enabled ||
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
          <p className="text-muted-foreground text-xs leading-relaxed">
            {t("taskNotifications.channels.dingtalk.webhookKeyDescription")}{" "}
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
            onTest={() => void handleSendTest(TASK_NOTIFICATION_CHANNELS.Wecom)}
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
          <p className="text-muted-foreground text-xs">
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
    </>
  )
}
