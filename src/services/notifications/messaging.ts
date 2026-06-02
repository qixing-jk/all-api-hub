import { defineExtensionMessaging } from "@webext-core/messaging"

import { createRuntimeMessagingLogger } from "~/services/runtimeMessaging/logger"
import type { RuntimeMessageResponse } from "~/services/runtimeMessaging/result"
import type { TaskNotificationChannel } from "~/types/taskNotifications"

export const TaskNotificationMessageTypes = {
  Test: "taskNotifications:test",
} as const

export interface TaskNotificationTestRequest {
  channel?: TaskNotificationChannel
}

export type TaskNotificationTestResponse = RuntimeMessageResponse<undefined>

interface TaskNotificationProtocolMap {
  [TaskNotificationMessageTypes.Test](
    data: TaskNotificationTestRequest,
  ): TaskNotificationTestResponse
}

export const {
  sendMessage: sendTaskNotificationMessage,
  onMessage: onTaskNotificationMessage,
} = defineExtensionMessaging<TaskNotificationProtocolMap>({
  logger: createRuntimeMessagingLogger("TaskNotificationMessaging"),
})
