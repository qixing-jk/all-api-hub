import { useTranslation } from "react-i18next"

import { ActionGroup, Button, BUTTON_LOADING_BEHAVIORS } from "~/components/ui"
import { Modal } from "~/components/ui/Dialog/Modal"
import {
  API_CREDENTIAL_PROFILES_TEST_IDS,
  getApiCredentialProfileVerifyProbeTestId,
} from "~/features/ApiCredentialProfiles/testIds"
import {
  useProfileVerification,
  type VerifyApiCredentialProfileDialogProps,
} from "~/features/ApiCredentialProfiles/verification/useProfileVerification"
import { getVerificationProbeSummary } from "~/features/Verification/api/probeSummary"
import { VERIFICATION_SOURCE_KINDS } from "~/features/Verification/api/types"
import {
  VerificationDialogHeader,
  VerificationSourceSubtitle,
} from "~/features/Verification/api/VerificationDialogHeader"
import { VerificationTestSection } from "~/features/Verification/api/VerificationLayout"
import { VerificationProbeRow } from "~/features/Verification/api/VerificationProbeRow"
import { VerificationRunAllButton } from "~/features/Verification/api/VerificationRunAllButton"
import { VerificationToolsPanel } from "~/features/Verification/api/VerificationToolsPanel"
import { getApiVerificationProbeLabel } from "~/services/verification/aiApiVerification/i18n"

import { ProfileVerificationConfiguration } from "./ProfileVerificationConfiguration"

/** Render the feature through its state and command owner. */
export function VerifyApiCredentialProfileDialog(
  props: VerifyApiCredentialProfileDialogProps,
) {
  const { isOpen, onClose, profile } = props
  const { t } = useTranslation(["aiApiVerification", "apiCredentialProfiles"])
  const controller = useProfileVerification(props)
  const {
    isRunning,
    modelId,
    setModelId,
    modelOptions,
    isFetchingModels,
    isPersisting,
    activeProbeIds,
    historyTarget,
    probes,
    persistedSummary,
    setPersistedSummary,
    isAnyProbeRunning,
    canClose,
    clearHistory,
    runSingleProbe,
    stopProbe,
    stopRun,
    concurrency,
    runAll,
    tools,
  } = controller
  const footer = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        {historyTarget ? (
          <Button variant="outline" onClick={clearHistory} disabled={!canClose}>
            {t("aiApiVerification:verifyDialog.history.clear")}
          </Button>
        ) : null}
      </div>
      <ActionGroup className="ml-auto">
        <Button
          variant="secondary"
          onClick={onClose}
          disabled={!canClose}
          data-testid={API_CREDENTIAL_PROFILES_TEST_IDS.verifyDialogCloseButton}
          className="hidden min-[52rem]:inline-flex"
        >
          {t("aiApiVerification:verifyDialog.actions.close")}
        </Button>
        <VerificationRunAllButton
          isRunning={isRunning}
          disabled={
            !isRunning && (isPersisting || isAnyProbeRunning || !profile)
          }
          concurrency={concurrency}
          onRun={runAll}
          onStop={stopRun}
        />
      </ActionGroup>
    </div>
  )

  return (
    <Modal
      isOpen={isOpen}
      onClose={canClose ? onClose : () => {}}
      headerTestId="verification-header"
      header={
        <VerificationDialogHeader
          title={t("aiApiVerification:verifyDialog.title")}
          subtitle={
            profile ? (
              <VerificationSourceSubtitle
                sourceKind={VERIFICATION_SOURCE_KINDS.Profile}
                baseUrl={profile.baseUrl}
                name={profile.name}
              />
            ) : null
          }
          historySummary={historyTarget ? persistedSummary : undefined}
        />
      }
      footer={footer}
      size="xl"
      panelClassName="verification-dialog max-w-[100rem] [&>[data-slot=modal-body]]:p-0"
      closeOnEsc={canClose}
      closeOnBackdropClick={canClose}
    >
      {!profile ? null : (
        <div className="space-y-density-3 sm:space-y-density-4">
          <VerificationTestSection
            running={isRunning}
            configuration={
              <ProfileVerificationConfiguration controller={controller} />
            }
            tools={<VerificationToolsPanel controller={tools} />}
            model={{
              modelId,
              onModelChange: (next) => {
                setModelId(next)
                setPersistedSummary(null)
              },
              options: modelOptions,
              disabled: !canClose || isRunning || tools.isRunning,
              loading: isFetchingModels,
            }}
          >
            {probes.map((probe) => {
              const result = probe.result
              const isDisabledForModel =
                probe.definition.requiresModelId && !modelId.trim()
              // The row is interruptible only while it owns an abortable
              // request; the persistence that follows is busy but not stoppable.
              const canStopProbe = probe.isRunning
              const isProbePersisting =
                !canStopProbe && activeProbeIds.has(probe.definition.id)
              const probeActionLabel = canStopProbe
                ? t("aiApiVerification:verifyDialog.actions.stop")
                : isProbePersisting
                  ? t("aiApiVerification:verifyDialog.actions.running")
                  : probe.attempts > 0
                    ? t("aiApiVerification:verifyDialog.actions.retry")
                    : t("aiApiVerification:verifyDialog.actions.runOne")

              const resultSummary = isDisabledForModel
                ? t("aiApiVerification:verifyDialog.requiresModelId")
                : getVerificationProbeSummary(t, probe.definition.id, result)

              return (
                <div
                  key={probe.definition.id}
                  data-testid={getApiCredentialProfileVerifyProbeTestId(
                    probe.definition.id,
                  )}
                >
                  <VerificationProbeRow
                    progress={probe.progress}
                    startedAt={probe.startedAt}
                    historical={probe.historical}
                    isRunning={probe.isRunning}
                    controller={tools}
                    probeId={probe.definition.id}
                    result={result}
                    summary={resultSummary}
                    runButtonProps={{
                      onClick: () => {
                        if (canStopProbe) {
                          stopProbe(probe.definition.id)
                          return
                        }
                        void runSingleProbe(probe.definition.id)
                      },
                      "data-testid":
                        API_CREDENTIAL_PROFILES_TEST_IDS.verifyProbeRunButton,
                      loadingBehavior: canStopProbe
                        ? BUTTON_LOADING_BEHAVIORS.Interactive
                        : BUTTON_LOADING_BEHAVIORS.Disabled,
                      loading: canStopProbe || isProbePersisting,
                      "aria-label": canStopProbe
                        ? t(
                            "aiApiVerification:verifyDialog.actions.stopProbe",
                            {
                              probe: getApiVerificationProbeLabel(
                                t,
                                probe.definition.id,
                              ),
                            },
                          )
                        : undefined,
                      disabled:
                        isRunning ||
                        isProbePersisting ||
                        (!canStopProbe && (isDisabledForModel || !profile)),
                      children: probeActionLabel,
                    }}
                  />
                </div>
              )
            })}
          </VerificationTestSection>
        </div>
      )}
    </Modal>
  )
}
