import { useCallback, useEffect, useId, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "~/components/ui"
import { ACCOUNT_KEY_RESOURCE_EDITOR_MODES as editorModes } from "~/features/KeyManagement/constants"
import {
  AccountKeyResourceEditorDialog,
  type AccountKeyResourceEditorDialogState,
} from "~/features/KeyManagement/resources/AccountKeyResourceEditorDialog"
import { useNativeResourceEditorLoadingVisibility } from "~/features/ResourceEditor"
import { buildOneTimeApiKeyProfileSaveAction } from "~/features/TokenProvisioning/secretDelivery/apiCredentialProfileSaveAction"
import { presentDetachedOneTimeSecret } from "~/features/TokenProvisioning/secretDelivery/DetachedOneTimeSecretDialog"
import { OneTimeSecretDialog } from "~/features/TokenProvisioning/secretDelivery/OneTimeSecretDialog"
import toast from "~/lib/notify"
import { accountKeySourceSignature } from "~/services/accounts/keys/accountKeyCreation"
import {
  prepareAccountKeyProvisioning,
  type AccountKeyProvisioningPlan,
} from "~/services/accounts/keys/accountKeyProvisioning"
import type { CreatedRuntimeSecret } from "~/services/accounts/keys/createdRuntimeSecret"
import {
  AccountKeyResourceError,
  type EditableResourceProjection,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import { createUserCommandProtectionBypassExecution } from "~/services/protectionBypass/client"
import {
  PROTECTION_BYPASS_SURFACES,
  PROTECTION_BYPASS_USER_COMMANDS,
} from "~/services/protectionBypass/contracts"
import type { DisplaySiteData } from "~/types"
import type { AccountKeyAutoProvisionMode } from "~/types/accountKeyAutoProvisioning"
import { createLogger } from "~/utils/core/logger"

import {
  AccountKeyProvisioningResultDialog,
  type ProvisioningResult,
} from "./AccountKeyProvisioningResultDialog"

const logger = createLogger("AccountKeyProvisioningDialog")
const execution = createUserCommandProtectionBypassExecution(
  PROTECTION_BYPASS_USER_COMMANDS.ManageApiKeys,
  PROTECTION_BYPASS_SURFACES.Options,
)

type ProvisioningDialogProps = {
  account: DisplaySiteData
  mode: AccountKeyAutoProvisionMode
  onClose: () => void
  /** Alternate operation owners can reuse the same UI without provider or storage writes. */
  preparePlan?: typeof prepareAccountKeyProvisioning
  getSecretSaveAction?: (secret: CreatedRuntimeSecret) => {
    onSave: () => Promise<void>
    label?: string
  }
  autoCopySecret?: boolean
}

/** Changing the credential source replaces the operation owner before another write can run. */
export function AccountKeyProvisioningDialog(props: ProvisioningDialogProps) {
  return (
    <ProvisioningSession
      key={`${accountKeySourceSignature(props.account)}:${props.mode}`}
      {...props}
    />
  )
}

/** Collects batch inputs before writing and retains confirmed results when later work stops. */
function ProvisioningSession({
  account,
  mode,
  onClose,
  preparePlan = prepareAccountKeyProvisioning,
  getSecretSaveAction,
  autoCopySecret,
}: ProvisioningDialogProps) {
  const { t, i18n } = useTranslation(["keyManagement", "common"])
  const [plan, setPlan] = useState<AccountKeyProvisioningPlan | null>(null)
  const [editor, setEditor] =
    useState<AccountKeyResourceEditorDialogState | null>(null)
  const [secret, setSecret] = useState<CreatedRuntimeSecret | null>(null)
  const [phase, setPhase] = useState<
    "loading" | "input" | "creating" | "secret" | "finished"
  >("loading")
  const [createdCount, setCreatedCount] = useState(0)
  const [result, setResult] = useState<ProvisioningResult | null>(null)
  const active = useRef(false)
  const controller = useRef<AbortController | null>(null)
  const planRef = useRef<AccountKeyProvisioningPlan | null>(null)
  const values = useRef(new Map<string, EditableResourceProjection>())
  const cursor = useRef(0)
  const inputCursor = useRef(0)
  const running = useRef(false)
  const stopped = useRef(false)
  const editorRef = useRef<AccountKeyResourceEditorDialogState | null>(null)
  const optionGenerations = useRef(new Map<string, number>())
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const secretRef = useRef<CreatedRuntimeSecret | null>(null)
  const progressToastId = useId()
  const getSaveAction = (result: CreatedRuntimeSecret) =>
    getSecretSaveAction
      ? getSecretSaveAction(result)
      : buildOneTimeApiKeyProfileSaveAction({
          result,
          t,
          logger,
          source: "AccountKeyProvisioningDialog",
        })
  const handOffSecret = (result: CreatedRuntimeSecret) => {
    presentDetachedOneTimeSecret(
      { result, saveAction: getSaveAction(result), autoCopy: autoCopySecret },
      i18n,
    )
  }

  const setCurrentEditor = (
    next: AccountKeyResourceEditorDialogState | null,
  ) => {
    editorRef.current = next
    setEditor(next)
  }
  const inputs = (current: AccountKeyProvisioningPlan) =>
    current.entries.filter((entry) => entry.editor)
  const openInput = (current: AccountKeyProvisioningPlan, index: number) => {
    const entry = inputs(current)[index]!
    const native = entry.editor!
    setCurrentEditor({
      editorId: index + 1,
      mode: editorModes.Create,
      siteType: account.siteType,
      fields: native.fields,
      initialValues: native.initialValues,
      values: native.initialValues,
    })
    setPhase("input")
  }
  const progressSummary = useCallback(
    () =>
      planRef.current ? (
        <span>
          {t("keyManagement:provisioning.progress", {
            created: cursor.current,
            total: planRef.current.entries.length,
            covered: planRef.current.coveredCount,
          })}
        </span>
      ) : null,
    [t],
  )
  const finishCancelled = useCallback(() => {
    setPhase("finished")
    if (cursor.current > 0) {
      setResult("cancelled")
      return
    }
    toast.info(
      <span className="gap-y-density-1 flex flex-col">
        <span>{t("keyManagement:provisioning.cancelled")}</span>
        {progressSummary()}
      </span>,
    )
    closeRef.current()
  }, [progressSummary, t])
  const fail = (error: unknown) => {
    if (!active.current) return
    setPhase("finished")
    const uncertain =
      error instanceof AccountKeyResourceError &&
      error.failure.code === "mutation_state_uncertain"
    if (cursor.current > 0 || uncertain) {
      setResult(uncertain ? "uncertain" : "failed")
      return
    }
    toast.error(
      <span className="gap-y-density-1 flex flex-col">
        <span>{t("keyManagement:native.editor.feedback.error")}</span>
        {progressSummary()}
      </span>,
    )
    closeRef.current()
  }
  const run = async () => {
    const current = planRef.current
    if (!active.current || !current || running.current) return
    if (stopped.current) {
      finishCancelled()
      return
    }
    running.current = true
    setPhase("creating")
    try {
      while (cursor.current < current.entries.length && !stopped.current) {
        const entry = current.entries[cursor.current]!
        // Cancellation requests stop subsequent writes; an in-flight create must settle first.
        const result = await entry.create(values.current.get(entry.key))
        cursor.current += 1
        if (!active.current) {
          if (result.createdSecret) handOffSecret(result.createdSecret)
          else
            toast.info(
              t("keyManagement:provisioning.progress", {
                created: cursor.current,
                total: current.entries.length,
                covered: current.coveredCount,
              }),
            )
          return
        }
        setCreatedCount(cursor.current)
        if (result.createdSecret) {
          secretRef.current = result.createdSecret
          setSecret(result.createdSecret)
          setPhase("secret")
          return
        }
      }
      if (active.current) {
        if (stopped.current) finishCancelled()
        else {
          setPhase("finished")
          toast.success(
            t("keyManagement:provisioning.completed", {
              created: cursor.current,
              total: current.entries.length,
              covered: current.coveredCount,
            }),
          )
          closeRef.current()
        }
      }
    } catch (error) {
      if (active.current) fail(error)
      else
        toast.error(
          t(
            error instanceof AccountKeyResourceError &&
              error.failure.code === "mutation_state_uncertain"
              ? "keyManagement:native.editor.feedback.uncertain"
              : "keyManagement:native.editor.feedback.error",
          ),
        )
    } finally {
      running.current = false
    }
  }

  useEffect(() => {
    active.current = true
    stopped.current = false
    const abort = new AbortController()
    controller.current = abort
    void preparePlan(account, mode, {
      signal: abort.signal,
      protectionBypassExecution: execution,
    })
      .then((current) => {
        if (!active.current || abort.signal.aborted) return
        planRef.current = current
        setPlan(current)
        if (!current.entries.length) {
          toast.success(
            t("keyManagement:provisioning.completed", {
              created: 0,
              covered: current.coveredCount,
            }),
          )
          closeRef.current()
          return
        }
        if (inputs(current).length) openInput(current, 0)
        else void run()
      })
      .catch((error) => {
        if (!abort.signal.aborted) fail(error)
      })
    return () => {
      toast.dismiss(progressToastId)
      active.current = false
      stopped.current = true
      if (!running.current) abort.abort()
      if (secretRef.current) {
        handOffSecret(secretRef.current)
        secretRef.current = null
      }
    }
    // The keyed owner fixes account/mode for this session; renders must never restart writes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const cancel = useCallback(() => {
    stopped.current = true
    if (running.current) return
    controller.current?.abort()
    finishCancelled()
  }, [finishCancelled])
  const acceptInput = async (
    editorId: number,
    projection: EditableResourceProjection,
  ) => {
    const current = planRef.current
    if (!current || editorRef.current?.editorId !== editorId) return
    const entry = inputs(current)[inputCursor.current]!
    const validation = entry.editor!.validate(projection)
    if (!validation.valid) {
      setCurrentEditor({
        ...editorRef.current,
        feedback: { code: "validation_failed", fieldIssues: validation.issues },
      })
      return
    }
    values.current.set(entry.key, projection)
    inputCursor.current += 1
    if (inputCursor.current < inputs(current).length)
      openInput(current, inputCursor.current)
    else {
      setCurrentEditor(null)
      await run()
    }
  }
  const loadOptions = async (
    editorId: number,
    fieldId: string,
    projection: EditableResourceProjection,
  ) => {
    const current = planRef.current
    const currentEditor = editorRef.current
    if (!current || currentEditor?.editorId !== editorId) return
    const native = inputs(current)[inputCursor.current]?.editor
    if (!native?.loadOptions) return
    const optionKey = `${editorId}:${fieldId}`
    const generation = (optionGenerations.current.get(optionKey) ?? 0) + 1
    optionGenerations.current.set(optionKey, generation)
    const isCurrentOptionLoad = () =>
      active.current &&
      editorRef.current?.editorId === editorId &&
      optionGenerations.current.get(optionKey) === generation
    setCurrentEditor({
      ...currentEditor,
      loadingFieldIds: [...(currentEditor.loadingFieldIds ?? []), fieldId],
    })
    try {
      const options = await native.loadOptions(fieldId, projection, {
        signal: controller.current?.signal,
      })
      if (!isCurrentOptionLoad() || !editorRef.current) return
      setCurrentEditor({
        ...editorRef.current,
        optionsByField: {
          ...editorRef.current.optionsByField,
          [fieldId]: options,
        },
        optionFailuresByField: {
          ...editorRef.current.optionFailuresByField,
          [fieldId]: undefined,
        },
        loadingFieldIds: editorRef.current.loadingFieldIds?.filter(
          (id) => id !== fieldId,
        ),
      })
    } catch (error) {
      if (!isCurrentOptionLoad() || !editorRef.current) return
      setCurrentEditor({
        ...editorRef.current,
        optionFailuresByField: {
          ...editorRef.current.optionFailuresByField,
          [fieldId]:
            error instanceof AccountKeyResourceError
              ? error.failure
              : { code: "unexpected" },
        },
        loadingFieldIds: editorRef.current.loadingFieldIds?.filter(
          (id) => id !== fieldId,
        ),
      })
    }
  }
  const saveAction = secret ? getSaveAction(secret) : undefined
  const loadingVisible = useNativeResourceEditorLoadingVisibility(
    phase === "loading" || phase === "creating"
      ? { attemptId: 1, reveal: "delayed" }
      : null,
  )
  useEffect(() => {
    if (!loadingVisible || (phase !== "loading" && phase !== "creating")) {
      toast.dismiss(progressToastId)
      return
    }
    toast.loading(
      <span className="gap-density-2 flex min-w-0 items-center">
        <span>
          {phase === "loading"
            ? t("keyManagement:provisioning.preparing")
            : t("keyManagement:provisioning.creating", {
                created: createdCount,
                total: plan?.entries.length ?? 0,
              })}
        </span>
        <Button
          variant="link"
          size="sm"
          className="h-auto min-h-0 shrink-0 p-0"
          onClick={cancel}
        >
          {t("common:actions.cancel")}
        </Button>
      </span>,
      { id: progressToastId },
    )
  }, [loadingVisible, phase, createdCount, plan, progressToastId, t, cancel])
  return (
    <>
      {result ? (
        <AccountKeyProvisioningResultDialog
          result={result}
          accountName={account.name}
          created={createdCount}
          covered={plan?.coveredCount ?? 0}
          total={plan?.entries.length ?? 0}
          onClose={() => {
            setResult(null)
            closeRef.current()
          }}
        />
      ) : null}
      <AccountKeyResourceEditorDialog
        editor={editor}
        notice={
          plan
            ? t("keyManagement:provisioning.input", {
                label: inputs(plan)[inputCursor.current]?.label,
                current: inputCursor.current + 1,
                total: inputs(plan).length,
              })
            : undefined
        }
        onClose={cancel}
        onSubmit={acceptInput}
        onValuesChange={(id, projection) => {
          if (editorRef.current?.editorId === id)
            setCurrentEditor({
              ...editorRef.current,
              values: projection,
              feedback: null,
            })
        }}
        onLoadOptions={(id, fieldId, projection) =>
          void loadOptions(id, fieldId, projection)
        }
      />
      <OneTimeSecretDialog
        autoCopy={autoCopySecret}
        isOpen={secret !== null}
        result={secret}
        saveAction={saveAction}
        onClose={() => {
          secretRef.current = null
          setSecret(null)
          void run()
        }}
      />
    </>
  )
}
