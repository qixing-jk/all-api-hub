import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { Alert, Button, Heading6 } from "~/components/ui"
import { FloatingLayerProvider } from "~/components/ui/floating-layer"
import { useVerificationWorkspace } from "~/features/Verification/api/useVerificationWorkspace"
import type { useVerificationConcurrency } from "~/hooks/verification/useVerificationConcurrency"
import { cn } from "~/lib/utils"

import { VERIFICATION_SIDEBAR_SIDES } from "./types"
import { VerificationConcurrencyControl } from "./VerificationConcurrencyControl"
import { VerificationSidebarPanel } from "./VerificationSidebarPanel"
import { VerificationWorkspaceToolbar } from "./VerificationWorkspaceToolbar"

import "./verificationWorkspace.css"

import {
  VerificationModelContext,
  type VerificationModelContextValue,
} from "~/features/Verification/api/VerificationModelContext"
import { VerificationSelectionContext } from "~/features/Verification/api/VerificationSelectionContext"

/** One persistent test tree: split panes, or a full list/detail view on narrow screens. */
export function VerificationTestSection({
  children,
  tools,
  configuration,
  supplementary,
  concurrency,
  running,
  initialSettingsOpen = false,
  source,
  preparing = false,
  model,
  configurationWarning,
}: {
  children: ReactNode
  tools: ReactNode
  configuration?: ReactNode
  supplementary?: ReactNode
  concurrency?: ReturnType<typeof useVerificationConcurrency>
  running?: boolean
  initialSettingsOpen?: boolean
  source?: ReactNode
  preparing?: boolean
  model?: VerificationModelContextValue
  configurationWarning?: ReactNode
}) {
  const { t } = useTranslation("aiApiVerification")
  const hasSettings = configuration !== undefined
  const workspace = useVerificationWorkspace({ preparing, initialSettingsOpen })
  const {
    frameRef,
    isWide,
    selectedId,
    selection,
    manualListCollapsed,
    listCollapsed,
    setListCollapsed,
    listToggleRef,
    listId,
    mobileTestSwitcher,
    settingsOpen,
    settingsId,
    toggleRef,
    settingsRef,
    closeSettings,
    toggleSettings,
    onSettingsKeyDown,
    setSettingsTarget,
    attachDetails,
  } = workspace
  return (
    <VerificationModelContext.Provider value={model ?? null}>
      <FloatingLayerProvider layer="modal-contained">
        <VerificationSelectionContext.Provider value={selection}>
          <div
            className="verification-workspace @container"
            data-testid="verification-workspace"
            data-list-collapsed={listCollapsed}
            data-mobile-test-switcher={mobileTestSwitcher}
            data-layout={isWide ? "split" : "stacked"}
            data-preparing={preparing}
          >
            {source ? <div data-verification-source>{source}</div> : null}
            {hasSettings ? (
              <VerificationWorkspaceToolbar
                workspace={workspace}
                preparing={preparing}
                running={running}
              />
            ) : null}
            {configurationWarning ? (
              <Alert variant="warning" className="mx-4 my-3 w-auto">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <div className="min-w-0 flex-1">{configurationWarning}</div>
                  {hasSettings && !settingsOpen ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={toggleSettings}
                    >
                      {t("verifyDialog.workspace.expandSettings")}
                    </Button>
                  ) : null}
                </div>
              </Alert>
            ) : null}
            <div
              ref={frameRef}
              data-settings-open={hasSettings && settingsOpen}
              data-sidebars={hasSettings}
              className="verification-workspace-frame relative min-w-0"
            >
              <div
                ref={attachDetails}
                hidden={preparing}
                className="contents"
              />
              <VerificationSidebarPanel
                side={VERIFICATION_SIDEBAR_SIDES.Left}
                animate={manualListCollapsed !== undefined}
                title={t("verifyDialog.workspace.tests")}
                id={listId}
                open={!listCollapsed && selectedId !== null && !settingsOpen}
                isWide={isWide}
                preparing={preparing}
                onClose={() => setListCollapsed(true)}
                toggleRef={listToggleRef}
                restoreFocus={!settingsOpen}
              >
                <div
                  id={`${listId}-items`}
                  data-verification-list
                  hidden={preparing}
                  inert={!isWide && settingsOpen}
                  aria-hidden={!isWide && settingsOpen ? true : undefined}
                  className="overscroll-y-contain [@container(min-width:52rem)]:h-full [@container(min-width:52rem)]:w-(--verification-list-width) [@container(min-width:52rem)]:overflow-y-auto [@container(min-width:52rem)]:border-r [@container(min-width:52rem)]:border-border [@container(min-width:52rem)]:bg-surface-subtle [@container(min-width:52rem)]:p-4"
                >
                  <div
                    data-verification-list-content
                    className="space-y-3 [@container(min-width:52rem)]:space-y-4"
                  >
                    <section
                      aria-label={t("verifyDialog.sections.routine")}
                      className="min-w-0 space-y-1 [@container(min-width:52rem)]:space-y-2"
                    >
                      <Heading6
                        hidden={listCollapsed}
                        className="text-xs font-medium text-muted-foreground"
                      >
                        {t("verifyDialog.sections.routine")}
                      </Heading6>
                      <div className="[@container(min-width:52rem)]:space-y-1">
                        {children}
                      </div>
                    </section>
                    <section
                      aria-label={t("verifyDialog.sections.onDemand")}
                      className={cn(
                        "min-w-0 border-t border-border",
                        listCollapsed
                          ? "my-2 pt-2"
                          : "space-y-1 pt-2 [@container(min-width:52rem)]:space-y-2 [@container(min-width:52rem)]:pt-4",
                      )}
                    >
                      <Heading6
                        hidden={listCollapsed}
                        className="text-xs font-medium text-muted-foreground"
                      >
                        {t("verifyDialog.sections.onDemand")}
                      </Heading6>
                      <div className="[@container(min-width:52rem)]:space-y-1">
                        {tools}
                      </div>
                    </section>
                  </div>
                </div>
              </VerificationSidebarPanel>
              {hasSettings ? (
                <VerificationSidebarPanel
                  side={VERIFICATION_SIDEBAR_SIDES.Right}
                  title={t("verifyDialog.workspace.settings")}
                  id={settingsId}
                  open={settingsOpen}
                  isWide={isWide}
                  preparing={preparing}
                  onClose={closeSettings}
                  toggleRef={toggleRef}
                  panelRef={settingsRef}
                  restoreFocus={listCollapsed}
                  onKeyDown={onSettingsKeyDown}
                >
                  <div
                    data-verification-settings-scroll
                    className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4"
                  >
                    <div
                      ref={setSettingsTarget}
                      hidden={preparing}
                      className="verification-workspace-test-settings"
                    />
                    {configuration}
                    {supplementary ? (
                      <div data-verification-supplementary>{supplementary}</div>
                    ) : null}
                  </div>
                  {concurrency && !preparing ? (
                    <div
                      data-verification-execution
                      className="shrink-0 border-t border-border px-4 py-3"
                      role="group"
                      aria-label={t("verifyDialog.workspace.execution")}
                    >
                      <VerificationConcurrencyControl
                        controller={concurrency}
                        disabled={running}
                      />
                    </div>
                  ) : null}
                </VerificationSidebarPanel>
              ) : null}
            </div>
          </div>
        </VerificationSelectionContext.Provider>
      </FloatingLayerProvider>
    </VerificationModelContext.Provider>
  )
}
