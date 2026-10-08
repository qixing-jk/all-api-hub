import { useTranslation } from "react-i18next"

import { FormField, Input, Link } from "~/components/ui"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import type { TaskNotificationSettingsViewModel } from "~/features/BasicSettings/hooks/useTaskNotificationSettingsViewModel"
import { blurInputOnEnter } from "~/hooks/useDeferredPreferenceField"
import { TASK_NOTIFICATION_CHANNELS } from "~/types/taskNotifications"
import { getDocsTaskNotificationsNtfyUrl } from "~/utils/navigation/docsLinks"

import {
  NotificationChannelActions,
  NotificationSettingItem,
} from "./NotificationSettingItem"

/** Presents channel-specific credentials and delivery controls using the shared draft owner. */
export function NotificationNtfyChannel({
  model,
}: {
  model: TaskNotificationSettingsViewModel
}) {
  const { i18n, t } = useTranslation(["settings", "common"])
  const {
    taskNotifications,
    testingChannel,
    channels,
    ntfy,
    handleNtfyChannelToggle,
    handleSendTest,
    canSendNtfyTest,
  } = model
  const ntfyDocsUrl = getDocsTaskNotificationsNtfyUrl(i18n.language)
  return (
    <>
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
            onTest={() => void handleSendTest(TASK_NOTIFICATION_CHANNELS.Ntfy)}
          />
        }
      >
        <div className="space-y-density-3">
          <div className="gap-y-density-3 grid gap-x-3 [@container(min-width:42rem)]:grid-cols-2">
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
              htmlFor={SETTINGS_ANCHORS.TASK_NOTIFICATIONS_NTFY_ACCESS_TOKEN}
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
          <p className="text-muted-foreground text-xs leading-relaxed">
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
    </>
  )
}
