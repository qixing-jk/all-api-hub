import type { TFunction } from "i18next"
import { Settings, X } from "lucide-react"
import type {
  KeyboardEvent as ReactKeyboardEvent,
  RefCallback,
  RefObject,
} from "react"

import { ActionGroup, Button, IconButton, Notice } from "~/components/ui"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover"
import { SelectPortalContainerProvider } from "~/components/ui/select"
import { VerificationDialogHeader } from "~/features/Verification/api/VerificationDialogHeader"
import { VerificationTestSection } from "~/features/Verification/api/VerificationLayout"
import { VerificationRunAllButton } from "~/features/Verification/api/VerificationRunAllButton"
import { VerificationToolsPanel } from "~/features/Verification/api/VerificationToolsPanel"
import { ApiCheckSiteAccessControl } from "~/features/WebAiApiCheck/content/ApiCheckSiteAccessControl"
import type {
  ApiCheckModalActions,
  ApiCheckModalViewModel,
} from "~/features/WebAiApiCheck/content/modal/apiCheckModalTypes"
import { ApiCheckSourceInput } from "~/features/WebAiApiCheck/content/modal/ApiCheckSourceInput"
import { ApiCheckProbeList } from "~/features/WebAiApiCheck/content/probes/ApiCheckProbeList"
import { WEB_AI_API_CHECK_TEST_IDS } from "~/features/WebAiApiCheck/content/testIds"
import { cn } from "~/lib/utils"

import { ApiCheckProfileOptions } from "./ApiCheckProfileOptions"
import { ApiCheckRequestConfiguration } from "./ApiCheckRequestConfiguration"

interface ApiCheckModalProps {
  t: TFunction<["webAiApiCheck", "common", "aiApiVerification"]>
  view: ApiCheckModalViewModel
  actions: ApiCheckModalActions
  refs: {
    popoverPortalContainerRef: RefCallback<HTMLDivElement>
    backdropRef: RefObject<HTMLDivElement | null>
    dialogRef: RefObject<HTMLDivElement | null>
    scrollContainerRef: RefObject<HTMLDivElement | null>
  }
}

const stopHostPageKeyboardShortcuts = (
  event: ReactKeyboardEvent<HTMLElement>,
) => {
  event.stopPropagation()
}

/**
 * Pure UI shell for the content-script API check modal.
 */
export function ApiCheckModal(props: ApiCheckModalProps) {
  return (
    <SelectPortalContainerProvider
      value={props.view.popoverPortalContainer ?? undefined}
    >
      <ApiCheckModalContent {...props} />
    </SelectPortalContainerProvider>
  )
}

/** Render the modal within its inherited dropdown container. */
function ApiCheckModalContent({ t, view, actions, refs }: ApiCheckModalProps) {
  if (!view.isOpen) return null

  const preparing = !view.baseUrl.trim() || !view.apiKey.trim()

  return (
    <div
      data-testid={WEB_AI_API_CHECK_TEST_IDS.modal}
      data-verification-layer-root
      className="pointer-events-none fixed inset-0 z-2147483647"
    >
      <div
        ref={refs.popoverPortalContainerRef}
        data-slot="api-check-portal-container"
        className="pointer-events-auto"
      />
      <div
        ref={refs.backdropRef}
        data-testid={WEB_AI_API_CHECK_TEST_IDS.backdrop}
        className="pointer-events-auto absolute inset-0 bg-overlay/40"
        onClick={() => {
          if (!view.canClose) return
          actions.close()
        }}
      />

      <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-3 py-density-3">
        <div
          ref={refs.dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="api-check-modal-title"
          tabIndex={-1}
          className={cn(
            "verification-dialog pointer-events-auto flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-xl border border-border bg-background shadow-xl",
            preparing ? "max-w-4xl" : "max-w-[100rem]",
          )}
          onKeyDown={stopHostPageKeyboardShortcuts}
          onKeyUp={stopHostPageKeyboardShortcuts}
        >
          <div
            data-testid="verification-header"
            className="relative shrink-0 border-b border-border px-4 py-density-4 sm:px-6"
          >
            <div className="pr-8">
              <VerificationDialogHeader
                portalContainer={view.popoverPortalContainer ?? undefined}
                title={
                  <h2
                    id="api-check-modal-title"
                    className="text-base font-semibold text-foreground"
                  >
                    {t("webAiApiCheck:modal.title")}
                  </h2>
                }
                subtitle={t("webAiApiCheck:modal.privacyHint")}
              />
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <IconButton
                  className="absolute top-4 right-12"
                  aria-label={t("common:labels.settings")}
                  variant="ghost"
                  size="sm"
                  disableAutoTooltip
                >
                  <Settings className="h-4 w-4" />
                </IconButton>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                container={view.popoverPortalContainer ?? undefined}
                aria-label={t("common:labels.settings")}
                className="w-80 max-w-[calc(100vw-2rem)] p-0"
              >
                <ApiCheckSiteAccessControl pageUrl={view.pageUrl} />
              </PopoverContent>
            </Popover>
            {/* Dismiss on pointer press so an open floating hint cannot consume the close click. */}
            <IconButton
              className="absolute top-4 right-4"
              data-testid={WEB_AI_API_CHECK_TEST_IDS.closeButton}
              aria-label={t("common:actions.close")}
              variant="ghost"
              size="sm"
              onClick={actions.close}
              disabled={!view.canClose}
              disableAutoTooltip
            >
              <X className="h-4 w-4" />
            </IconButton>
          </div>

          <div
            ref={refs.scrollContainerRef}
            data-verification-scroll
            data-testid={WEB_AI_API_CHECK_TEST_IDS.scrollContainer}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
          >
            <div>
              {view.validationError || view.testStoppedMessage ? (
                <div className="space-y-density-3 px-4 py-density-3 sm:px-6">
                  {view.validationError ? (
                    <div className="rounded-md border border-destructive-border bg-destructive-soft px-3 py-density-3 text-sm text-destructive-soft-foreground">
                      {view.validationError}
                    </div>
                  ) : null}

                  {view.testStoppedMessage ? (
                    <Notice tone="info" description={view.testStoppedMessage} />
                  ) : null}
                </div>
              ) : null}
              <VerificationTestSection
                preparing={preparing}
                model={{
                  modelId: view.modelId,
                  onModelChange: actions.setModelId,
                  options: view.modelIdsOptions,
                  disabled:
                    view.isRunningAll ||
                    view.isAnyProbeRunning ||
                    view.verificationTools.isRunning,
                  loading: view.isFetchingModels,
                  portalContainer: view.popoverPortalContainer ?? undefined,
                }}
                source={
                  <div
                    className={cn(
                      "space-y-4 px-4 py-density-3 sm:px-6",
                      preparing && "w-full",
                    )}
                  >
                    {preparing ? (
                      <div className="space-y-2">
                        <h3 className="text-xl font-semibold text-foreground">
                          {t("webAiApiCheck:modal.preparation.title")}
                        </h3>
                        <p className="text-sm leading-relaxed text-muted-foreground">
                          {t("webAiApiCheck:modal.preparation.description")}
                        </p>
                      </div>
                    ) : null}
                    <ApiCheckSourceInput
                      hasCredentials={Boolean(
                        view.baseUrl.trim() && view.apiKey.trim(),
                      )}
                      sourceText={view.sourceText}
                      onSourceTextChange={actions.setSourceText}
                    />
                  </div>
                }
                initialSettingsOpen={!view.baseUrl || !view.apiKey}
                running={view.isRunningAll}
                configuration={
                  <ApiCheckRequestConfiguration
                    t={t}
                    view={view}
                    actions={actions}
                    preparing={preparing}
                  />
                }
                supplementary={
                  <ApiCheckProfileOptions
                    t={t}
                    view={view}
                    actions={actions}
                    preparing={preparing}
                  />
                }
                tools={
                  <VerificationToolsPanel controller={view.verificationTools} />
                }
              >
                <ApiCheckProbeList
                  t={t}
                  probes={view.probes}
                  tools={view.verificationTools}
                  isRunningAll={view.isRunningAll}
                  isFetchingModels={view.isFetchingModels}
                  onRunProbe={actions.runProbe}
                  onStopProbe={actions.stopProbe}
                />
              </VerificationTestSection>
            </div>
          </div>
          <div className="shrink-0 border-t border-border-subtle px-4 py-density-3 sm:px-6 sm:py-density-4">
            <ActionGroup>
              {!view.hasAnyResult ? (
                <p
                  id="api-check-save-hint"
                  className="w-full text-xs leading-relaxed text-muted-foreground sm:mr-auto sm:w-auto sm:min-w-0 sm:flex-1"
                >
                  {t("webAiApiCheck:modal.hints.saveWithoutTest")}
                </p>
              ) : null}
              <Button
                type="button"
                variant="outline"
                data-testid={WEB_AI_API_CHECK_TEST_IDS.saveToProfilesButton}
                aria-describedby={
                  !view.hasAnyResult ? "api-check-save-hint" : undefined
                }
                onClick={actions.saveProfile}
                disabled={!view.canSaveProfile}
                loading={view.isSavingProfile}
              >
                {view.isSavingProfile
                  ? t("webAiApiCheck:modal.actions.saving")
                  : t("webAiApiCheck:modal.actions.saveToProfiles")}
              </Button>
              <VerificationRunAllButton
                isRunning={view.isRunningAll}
                disabled={preparing || view.isRunAllActionDisabled}
                concurrency={view.concurrency}
                onRun={actions.runAll}
                onStop={actions.stopRunAll}
                runLabel={t("webAiApiCheck:modal.actions.test")}
                stopLabel={
                  view.isStoppingRunAll
                    ? t("webAiApiCheck:modal.actions.stopping")
                    : t("webAiApiCheck:modal.actions.stopTest")
                }
                portalContainer={view.popoverPortalContainer ?? undefined}
                className={
                  preparing && !view.isRunningAll
                    ? "pointer-events-none opacity-50"
                    : undefined
                }
              />
            </ActionGroup>
          </div>
        </div>
      </div>
    </div>
  )
}
