import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import { useTranslation } from "react-i18next"

import {
  accountKeySourceSignature,
  prepareDefaultAccountKeyCreation,
  type AccountKeyCreationPlan,
  type AccountKeyCreationResult,
} from "~/services/accounts/accountKeyCreation"
import {
  AccountKeyResourceError,
  type AccountKeyProvisioningRequirement,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import type { DisplaySiteData } from "~/types"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"

type Selection = { requirements: readonly AccountKeyProvisioningRequirement[] }
type Failure =
  | { kind: "unsupported" | "input-required" | "uncertain" }
  | { kind: "failed"; message: string }
type State = {
  kind: "idle" | "resolving" | "selecting" | "creating"
  selection: Selection | null
  error: Failure | null
}
const idle = (): State => ({ kind: "idle", selection: null, error: null })
const logger = createLogger("DefaultTokenQuickCreate")

/** Retains one native plan through group selection; resets never replay uncertain writes. */
export function useDefaultTokenQuickCreate({
  isActive,
  account,
  canCreate,
  onCreated,
  onInputRequired,
}: {
  isActive: boolean
  account: DisplaySiteData | null
  canCreate: boolean
  onCreated: (result: AccountKeyCreationResult) => void | Promise<void>
  onInputRequired?: () => void
}) {
  const { t } = useTranslation(["ui", "keyManagement", "messages"])
  const [state, setState] = useState<State>(idle)
  const planRef = useRef<{
    plan: AccountKeyCreationPlan
    controller: AbortController
  } | null>(null)
  const operationRef = useRef<{
    controller: AbortController
    id: number
  } | null>(null)
  const generation = useRef(0)
  const uncertainSources = useRef(new Set<string>())
  const sourceKey = accountKeySourceSignature(account)
  const sourceRef = useRef({ sourceKey, isActive })
  useLayoutEffect(() => {
    sourceRef.current = { sourceKey, isActive }
  }, [sourceKey, isActive])
  const observers = useRef({ onCreated, onInputRequired })
  useLayoutEffect(() => {
    observers.current = { onCreated, onInputRequired }
  }, [onCreated, onInputRequired])

  const cancelPending = useCallback(() => {
    generation.current++
    operationRef.current?.controller.abort()
    planRef.current?.controller.abort()
    operationRef.current = null
    planRef.current = null
  }, [])
  const reset = useCallback(() => {
    cancelPending()
    setState(idle())
  }, [cancelPending])
  useEffect(() => {
    reset()
    return cancelPending
  }, [sourceKey, isActive, reset, cancelPending])

  const execute = useCallback(
    async (requirementKey?: string) => {
      if (!isActive || !account || operationRef.current) return
      if (!canCreate || uncertainSources.current.has(sourceKey)) {
        setState({
          ...idle(),
          error: { kind: canCreate ? "uncertain" : "unsupported" },
        })
        return
      }
      const id = ++generation.current
      const controller =
        requirementKey && planRef.current
          ? planRef.current.controller
          : new AbortController()
      operationRef.current = { id, controller }
      const isCurrent = () =>
        generation.current === id &&
        !controller.signal.aborted &&
        sourceRef.current.isActive &&
        sourceRef.current.sourceKey === sourceKey
      let selection: Selection | null = null
      setState({
        ...idle(),
        kind: requirementKey ? "creating" : "resolving",
        selection: state.selection,
      })
      try {
        const plan = requirementKey
          ? planRef.current?.plan
          : await prepareDefaultAccountKeyCreation(account, {
              signal: controller.signal,
            })
        if (!isCurrent()) return
        if (!plan) {
          setState({ ...idle(), error: { kind: "input-required" } })
          return
        }
        planRef.current = { plan, controller }
        if (plan.kind === "input-required") {
          setState({ ...idle(), error: { kind: "input-required" } })
          observers.current.onInputRequired?.()
          return
        }
        if (plan.kind === "selection-required") {
          selection = { requirements: plan.requirements }
          if (!requirementKey) {
            setState({ kind: "selecting", selection, error: null })
            return
          }
          const selected = plan.requirements.find(
            (item) => item.requirementKey === requirementKey,
          )
          if (!selected) {
            setState({
              kind: "selecting",
              selection,
              error: { kind: "input-required" },
            })
            return
          }
          if (selected.provisioning.kind === "input-required") {
            setState({ ...idle(), error: { kind: "input-required" } })
            observers.current.onInputRequired?.()
            return
          }
        }
        if (!isCurrent()) return
        setState({ kind: "creating", selection, error: null })
        const result = await (plan.kind === "ready"
          ? plan.create()
          : plan.create(requirementKey!))
        if (!isCurrent()) return
        setState(idle())
        planRef.current = null
        try {
          await observers.current.onCreated(result)
        } catch (error) {
          logger.error("Created key handoff failed", error)
        }
      } catch (error) {
        const uncertain =
          error instanceof AccountKeyResourceError &&
          error.failure.code === "mutation_state_uncertain"
        if (uncertain) uncertainSources.current.add(sourceKey)
        if (!isCurrent()) return
        setState({
          kind: selection && !uncertain ? "selecting" : "idle",
          selection: uncertain ? null : selection,
          error: uncertain
            ? { kind: "uncertain" }
            : { kind: "failed", message: getErrorMessage(error) },
        })
      } finally {
        if (operationRef.current?.id === id) operationRef.current = null
      }
    },
    [account, canCreate, isActive, sourceKey, state.selection],
  )

  const failure = state.error
  const error = !failure
    ? null
    : failure.kind === "uncertain"
      ? t("keyManagement:native.editor.feedback.uncertain")
      : failure.kind === "unsupported"
        ? t("ui:dialog.copyKey.createNotSupported")
        : failure.kind === "input-required"
          ? t("messages:tokenProvisioning.createRequiresGroup")
          : t("ui:dialog.copyKey.createFailed", {
              error: "message" in failure ? failure.message : "",
            })
  return {
    state,
    view: {
      selection: state.selection,
      isBusy: state.kind === "resolving" || state.kind === "creating",
      isCreating: state.kind === "creating",
      error,
    },
    start: () => execute(),
    confirmGroup: (key: string) =>
      state.kind === "selecting" ? execute(key) : Promise.resolve(),
    cancelSelection: () => {
      if (state.kind === "selecting") reset()
    },
    reset,
  }
}
