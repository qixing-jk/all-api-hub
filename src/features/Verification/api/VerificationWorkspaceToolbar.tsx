import { SlidersHorizontal } from "lucide-react"
import { useTranslation } from "react-i18next"

import { SidebarIcon } from "~/components/icons/SidebarIcon"
import { Button } from "~/components/ui"
import { type useVerificationWorkspace } from "~/features/Verification/api/useVerificationWorkspace"
import { cn } from "~/lib/utils"

/** Workspace toolbar and portal mounts; selection and focus stay with the workspace. */
export function VerificationWorkspaceToolbar({
  workspace,
  preparing,
  running,
}: {
  workspace: Pick<
    ReturnType<typeof useVerificationWorkspace>,
    | "currentTestLabel"
    | "isWide"
    | "listCollapsed"
    | "listId"
    | "listToggleLabel"
    | "listToggleRef"
    | "listToggleText"
    | "mobileTestSwitcher"
    | "setHeaderStatusTarget"
    | "setHeaderTarget"
    | "setListCollapsed"
    | "setManualSettingsOpen"
    | "settingsId"
    | "settingsOpen"
    | "settingsToggleLabel"
    | "toggleRef"
    | "toggleSettings"
  >
  preparing: boolean
  running?: boolean
}) {
  const { t } = useTranslation("aiApiVerification")
  const {
    currentTestLabel,
    isWide,
    listCollapsed,
    listId,
    listToggleLabel,
    listToggleRef,
    listToggleText,
    mobileTestSwitcher,
    setHeaderStatusTarget,
    setHeaderTarget,
    setListCollapsed,
    setManualSettingsOpen,
    settingsId,
    settingsOpen,
    settingsToggleLabel,
    toggleRef,
    toggleSettings,
  } = workspace
  return (
    <div
      hidden={preparing}
      data-verification-workspace-bar
      data-settings-open={settingsOpen}
      className="verification-workspace-bar sticky top-0 z-30 flex min-h-12 flex-wrap items-center border-b border-border bg-background"
    >
      <div className="verification-workspace-list-header flex min-h-12 shrink-0 items-center gap-2 bg-surface-subtle px-1 [@container(min-width:52rem)]:w-(--verification-list-width) [@container(min-width:52rem)]:border-r [@container(min-width:52rem)]:border-border">
        <Button
          ref={listToggleRef}
          variant="ghost"
          size="sm"
          aria-label={`${listToggleText} · ${listToggleLabel}`}
          title={
            mobileTestSwitcher
              ? `${listToggleText} · ${listToggleLabel}`
              : listToggleLabel
          }
          aria-expanded={!listCollapsed}
          aria-haspopup={!isWide ? "dialog" : undefined}
          aria-controls={listId}
          onClick={() => {
            setListCollapsed(!listCollapsed)
            if (!isWide) setManualSettingsOpen(false)
          }}
          className={cn(
            "min-w-0 flex-1 text-sm font-semibold",
            listCollapsed || mobileTestSwitcher
              ? "justify-center px-0"
              : "justify-start px-3",
          )}
        >
          <SidebarIcon
            side="left"
            className="size-4 shrink-0"
            aria-hidden="true"
          />
          <span
            className={
              listCollapsed ? "[@container(min-width:52rem)]:hidden" : undefined
            }
          >
            {listToggleText}
          </span>
        </Button>
        {running && !listCollapsed ? (
          <span role="status" className="ml-auto pr-3 text-xs text-primary">
            {t("verifyDialog.actions.running")}
          </span>
        ) : null}
      </div>
      <div
        data-testid="verification-active-test"
        data-verification-active-test
        role="group"
        aria-label={currentTestLabel}
        className="order-last flex min-h-12 w-full min-w-0 flex-col items-start gap-2 border-t border-border px-5 py-2 text-sm font-medium text-foreground [@container(min-width:52rem)]:order-none [@container(min-width:52rem)]:w-auto [@container(min-width:52rem)]:flex-1 [@container(min-width:52rem)]:flex-row [@container(min-width:52rem)]:items-center [@container(min-width:52rem)]:gap-3 [@container(min-width:52rem)]:border-t-0"
      >
        <div
          data-verification-header-identity
          className="flex min-w-0 shrink items-center gap-2"
        >
          <span
            className={cn(
              "min-w-0 shrink truncate",
              mobileTestSwitcher && "hidden",
            )}
          >
            {currentTestLabel}
          </span>
          <div
            ref={setHeaderStatusTarget}
            className="flex shrink-0 items-center gap-2"
          />
        </div>
        <div
          ref={setHeaderTarget}
          data-verification-header-content
          className="flex w-full min-w-0 flex-1 items-center gap-2 [@container(min-width:52rem)]:w-auto"
        />
      </div>
      <div className="verification-workspace-controls ml-auto flex shrink-0 items-center justify-between gap-2 px-1">
        <Button
          ref={toggleRef}
          type="button"
          size="sm"
          variant="ghost"
          className="min-w-0 flex-1 justify-between px-3 text-sm font-semibold"
          aria-label={t("verifyDialog.workspace.settings")}
          title={settingsToggleLabel}
          aria-expanded={settingsOpen}
          aria-controls={settingsId}
          onClick={toggleSettings}
        >
          <span className="verification-settings-title">
            {t("verifyDialog.workspace.settings")}
          </span>
          <SidebarIcon
            side="right"
            className="size-4 shrink-0 [@container(max-width:51.999rem)]:hidden"
            aria-hidden="true"
          />
          <SlidersHorizontal
            className="size-3.5 shrink-0 [@container(min-width:52rem)]:hidden"
            aria-hidden="true"
          />
        </Button>
      </div>
    </div>
  )
}
