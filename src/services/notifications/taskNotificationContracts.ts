import {
  type TaskNotificationChannel,
  type TaskNotificationStatus,
  type TaskNotificationTask,
} from "~/types/taskNotifications"

export interface TaskNotificationCounts {
  total?: number
  success?: number
  alreadyChecked?: number
  failed?: number
  uncertain?: number
  skipped?: number
}

export interface TaskNotificationPayload {
  task: TaskNotificationTask
  status: TaskNotificationStatus
  counts?: TaskNotificationCounts
  title?: string
  message?: string
}

export interface TaskNotificationContent {
  title: string
  message: string
}

export interface TaskNotificationDeliveryOptions {
  channels?: readonly TaskNotificationChannel[]
  ignoreTaskPreference?: boolean
  surfaceErrors?: boolean
}
