import {
  Eraser,
  Eye,
  Globe,
  Link2,
  MousePointerClick,
  Repeat,
} from "lucide-react"
import { useCallback, useMemo, useState } from "react"

import toast from "~/lib/notify"
import {
  resolveSurveyPageUrl,
  uninstallSurveyService,
} from "~/services/uninstallSurvey/uninstallSurvey"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"

import type { DevPanelSection } from "../types"

const logger = createLogger("DevUninstallSurveySection")

/**
 * The docs dev server (`pnpm --dir docs docs:dev`) serves the same page path as
 * the deployed site, so the local target only differs by origin.
 */
const LOCAL_SURVEY_PAGE_URL = "http://localhost:8080/uninstall.html"

/**
 * Survives reloads so a chosen target stays selected between dev sessions.
 */
const TARGET_STORAGE_KEY = "aah-dev:uninstall-survey-target"

type SurveyTarget = "local" | "remote"

/**
 * Action ids shared by the action wiring and the `loading` flag, so only the
 * action that is running reports itself as loading.
 */
const ACTION_IDS = {
  switchTarget: "switch-uninstall-target",
  preview: "preview-uninstall-url",
  register: "register-uninstall-url",
  openPreview: "open-uninstall-preview",
  clear: "clear-uninstall-url",
} as const

type UninstallSurveyActionId = (typeof ACTION_IDS)[keyof typeof ACTION_IDS]

/**
 * Reads the last selected target, defaulting to the deployed page.
 */
function readStoredTarget(): SurveyTarget {
  try {
    return globalThis.localStorage?.getItem(TARGET_STORAGE_KEY) === "local"
      ? "local"
      : "remote"
  } catch {
    return "remote"
  }
}

/**
 * Persists the selected target; a failure only costs the remembered choice.
 */
function storeTarget(target: SurveyTarget): void {
  try {
    globalThis.localStorage?.setItem(TARGET_STORAGE_KEY, target)
  } catch (error) {
    logger.warn("Failed to persist uninstall survey target", error)
  }
}

/**
 * Strips the anonymous id from a preview URL so opening the survey page from
 * the dev panel never counts as a real uninstall in product analytics (the
 * page-view event is only sent when a uid is present).
 */
function withoutAnalyticsId(url: string): string {
  try {
    const parsed = new URL(url)
    parsed.searchParams.delete("uid")
    return parsed.toString()
  } catch {
    return url
  }
}

/**
 * Uninstall survey URL preview and registration.
 *
 * `runtime.setUninstallURL` has no getter, so the panel can only show a fresh
 * compose — it cannot read back what the browser currently holds.
 */
export function useUninstallSurveyDevSection(): DevPanelSection {
  const [target, setTarget] = useState<SurveyTarget>(readStoredTarget)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [busyAction, setBusyAction] = useState<UninstallSurveyActionId | null>(
    null,
  )
  const isBusy = busyAction !== null

  const targetBaseUrl =
    target === "local" ? LOCAL_SURVEY_PAGE_URL : resolveSurveyPageUrl()

  /**
   * Runs one action with the shared busy protocol and error reporting: only the
   * action that is running shows the panel's spinner, and a failure reaches the
   * user as one toast instead of a hand-written catch in every handler.
   */
  const runAction = useCallback(
    async (
      actionId: UninstallSurveyActionId,
      failureMessage: string,
      work: () => Promise<void>,
    ) => {
      setBusyAction(actionId)
      try {
        await work()
      } catch (error) {
        logger.error(failureMessage, error)
        toast.error(getErrorMessage(error))
      } finally {
        setBusyAction(null)
      }
    },
    [],
  )

  const handleSwitchTarget = useCallback(() => {
    // Side effects stay out of the state updater: React re-runs updaters in
    // development, which would report every switch twice.
    const next: SurveyTarget = target === "local" ? "remote" : "local"
    setTarget(next)
    storeTarget(next)
    toast.success(
      `Dev: survey target switched to ${next}. Register again to apply it.`,
    )
  }, [target])

  const handlePreview = useCallback(
    () =>
      runAction(
        ACTION_IDS.preview,
        "Failed to compose uninstall survey URL",
        async () => {
          const url = await uninstallSurveyService.composeUrl({
            baseUrl: targetBaseUrl,
          })
          setPreviewUrl(url)
          if (url) {
            toast.success("Dev: survey URL composed")
          } else {
            toast.error("Dev: failed to compose survey URL")
          }
        },
      ),
    [runAction, targetBaseUrl],
  )

  const handleRegister = useCallback(
    () =>
      runAction(
        ACTION_IDS.register,
        "Failed to register uninstall survey URL",
        async () => {
          const url = await uninstallSurveyService.registerNow({
            baseUrl: targetBaseUrl,
          })
          if (url) {
            setPreviewUrl(url)
            toast.success(
              "Dev: uninstall survey URL registered; removing the extension will open it",
            )
          } else {
            toast.error("Dev: uninstall URL registration unavailable here")
          }
        },
      ),
    [runAction, targetBaseUrl],
  )

  const handleClear = useCallback(
    () =>
      runAction(
        ACTION_IDS.clear,
        "Failed to clear uninstall survey URL",
        async () => {
          if (await uninstallSurveyService.clear()) {
            toast.success("Dev: uninstall survey URL cleared")
          } else {
            toast.error("Dev: uninstall URL clearing unavailable here")
          }
        },
      ),
    [runAction],
  )

  const handleOpenPreview = useCallback(
    () =>
      runAction(
        ACTION_IDS.openPreview,
        "Failed to open uninstall survey preview",
        async () => {
          const url =
            previewUrl ??
            (await uninstallSurveyService.composeUrl({
              baseUrl: targetBaseUrl,
            }))
          if (!url) {
            toast.error("Dev: failed to compose survey URL")
            return
          }
          window.open(withoutAnalyticsId(url), "_blank", "noopener,noreferrer")
        },
      ),
    [previewUrl, runAction, targetBaseUrl],
  )

  return useMemo(
    () => ({
      id: "uninstall-survey",
      title: "Uninstall survey",
      icon: MousePointerClick,
      description:
        "Preview or register the page the browser opens after the extension is uninstalled. Opening the page from here strips the anonymous id so a preview never counts as a real uninstall.",
      rows: [
        {
          id: "survey-target",
          label: "Survey target",
          value: targetBaseUrl,
          tone: "runtime",
          hint:
            target === "local"
              ? "Local dev server (pnpm --dir docs docs:dev)."
              : "Deployed page; the build-time VITE_PUBLIC_UNINSTALL_SURVEY_URL overrides it when set.",
        },
        {
          id: "composed-url",
          label: "Composed URL",
          value: previewUrl,
          tone: "runtime",
          copyable: true,
          hint: "setUninstallURL has no getter, so this is a fresh compose, not the currently registered value.",
        },
      ],
      surfaces: ["options"],
      actions: [
        {
          id: ACTION_IDS.switchTarget,
          label: `Dev: Switch target to ${target === "local" ? "remote" : "local"}`,
          icon: Repeat,
          disabled: isBusy,
          run: handleSwitchTarget,
        },
        {
          id: ACTION_IDS.preview,
          label: "Dev: Compose URL preview",
          icon: Eye,
          loading: busyAction === ACTION_IDS.preview,
          disabled: isBusy,
          run: handlePreview,
        },
        {
          id: ACTION_IDS.register,
          label: "Dev: Register uninstall URL",
          icon: Link2,
          loading: busyAction === ACTION_IDS.register,
          disabled: isBusy,
          run: handleRegister,
        },
        {
          id: ACTION_IDS.openPreview,
          label: "Dev: Open survey page (no uid)",
          icon: Globe,
          loading: busyAction === ACTION_IDS.openPreview,
          disabled: isBusy,
          run: handleOpenPreview,
        },
        {
          id: ACTION_IDS.clear,
          label: "Dev: Clear uninstall URL",
          icon: Eraser,
          loading: busyAction === ACTION_IDS.clear,
          disabled: isBusy,
          run: handleClear,
        },
      ],
    }),
    [
      busyAction,
      handleClear,
      handleOpenPreview,
      handlePreview,
      handleRegister,
      handleSwitchTarget,
      isBusy,
      previewUrl,
      target,
      targetBaseUrl,
    ],
  )
}
