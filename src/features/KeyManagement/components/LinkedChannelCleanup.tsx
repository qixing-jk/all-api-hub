import { useEffect, useId, useState } from "react"
import { useTranslation } from "react-i18next"

import { Storage } from "@plasmohq/storage"

import { Alert, Button, Checkbox, Label } from "~/components/ui"
import { getManagedSiteCapabilities } from "~/services/apiAdapters/registry"
import { LINKED_CHANNEL_CLEANUP_STORAGE_KEY } from "~/services/core/storageKeys"
import {
  getPendingLinkedChannelCleanupTasks,
  runLinkedChannelCleanup,
  type LinkedChannelCleanupTask,
} from "~/services/managedSites/linkedChannelCleanup"
import { getCurrentManagedSiteType } from "~/services/managedSites/runtimeConfig"

/** Explicitly limits linked deletion to the currently configured managed site. */
export function LinkedChannelCleanupOption({
  checked,
  onCheckedChange,
  disabled,
}: {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
}) {
  const { t } = useTranslation("keyManagement")
  const id = useId()
  const [available, setAvailable] = useState(false)
  useEffect(() => {
    let active = true
    void getCurrentManagedSiteType()
      .then((type) => getManagedSiteCapabilities(type).config.get())
      .then((config) => {
        if (active) {
          setAvailable(Boolean(config))
          onCheckedChange(Boolean(config))
        }
      })
      .catch(() => {
        if (active) {
          setAvailable(false)
          onCheckedChange(false)
        }
      })
    return () => {
      active = false
    }
  }, [onCheckedChange])
  if (!available) return null
  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2">
        <Checkbox
          id={id}
          checked={checked}
          disabled={disabled}
          onCheckedChange={(value) => onCheckedChange(value === true)}
        />
        <Label htmlFor={id}>{t("linkedCleanup.option")}</Label>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        {t("linkedCleanup.description")}
      </p>
    </div>
  )
}

/** Pending work remains visible even after its source key has disappeared. */
export function LinkedChannelCleanupPending() {
  const { t } = useTranslation("keyManagement")
  const [tasks, setTasks] = useState<LinkedChannelCleanupTask[]>([])
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let active = true
    let generation = 0
    const refresh = () => {
      const current = ++generation
      void getPendingLinkedChannelCleanupTasks().then((items) => {
        if (active && current === generation) setTasks(items)
      })
    }
    const storage = new Storage({ area: "local" })
    storage.watch({ [LINKED_CHANNEL_CLEANUP_STORAGE_KEY]: refresh })
    refresh()
    const timer = setInterval(refresh, 1000)
    return () => {
      clearInterval(timer)
      active = false
      storage.unwatch({ [LINKED_CHANNEL_CLEANUP_STORAGE_KEY]: refresh })
    }
  }, [])
  if (!tasks.length || busy) return null
  return (
    <Alert
      variant="warning"
      title={t("linkedCleanup.pending", {
        count: tasks.reduce((total, task) => total + task.targets.length, 0),
      })}
    >
      <p>{t("linkedCleanup.retryDescription")}</p>
      <ul className="my-2 text-sm">
        {tasks.flatMap((task) =>
          task.targets.map((target) => (
            <li key={`${task.id}:${target.ref.resourceId}`}>
              {task.siteType} · {target.name}
            </li>
          )),
        )}
      </ul>
      <Button
        size="sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          try {
            for (const task of tasks) {
              try {
                await runLinkedChannelCleanup(task)
              } catch {
                /* Keep pending work visible. */
              }
            }
          } finally {
            setTasks(await getPendingLinkedChannelCleanupTasks())
            setBusy(false)
          }
        }}
      >
        {t("linkedCleanup.retry")}
      </Button>
    </Alert>
  )
}
