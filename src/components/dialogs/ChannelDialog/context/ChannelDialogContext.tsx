import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react"

import type { ChannelResourceEditContext } from "~/components/dialogs/ChannelDialog/hooks/useChannelForm"
import { DIALOG_MODES, type DialogMode } from "~/constants/dialogModes"
import type { ManagedSiteChannelAssessmentSignals } from "~/services/managedSites/channelAssessmentSignals"
import type { ApiToken, DisplaySiteData } from "~/types"
import type { ChannelFormData, ManagedSiteChannel } from "~/types/managedSite"

export const CHANNEL_DIALOG_MUTATION_RESULTS = {
  Success: "success",
  Failure: "failure",
} as const

export type ChannelDialogMutationResult =
  (typeof CHANNEL_DIALOG_MUTATION_RESULTS)[keyof typeof CHANNEL_DIALOG_MUTATION_RESULTS]

type ChannelDialogMutationOutcomeHandler = (outcome: {
  mode: DialogMode
  result: ChannelDialogMutationResult
  siteType: string
}) => void

export interface ChannelDialogAdvisoryWarning {
  kind: string
  title: string
  description: string
  assessment?: ManagedSiteChannelAssessmentSignals | null
}

interface ChannelDialogState {
  isOpen: boolean
  mode: DialogMode
  channel?: ManagedSiteChannel | null
  initialValues?: Partial<ChannelFormData>
  initialModels?: string[]
  initialGroups?: string[]
  showModelPrefillWarning?: boolean
  advisoryWarning?: ChannelDialogAdvisoryWarning | null
  onRequestRealKey?:
    | ((options: { setKey: (key: string) => void }) => Promise<void>)
    | null
  onSuccessCallback?: (result: any) => void
  onMutationOutcome?: ChannelDialogMutationOutcomeHandler | null
  resourceEdit?: ChannelResourceEditContext | null
}

interface DuplicateChannelWarningState {
  isOpen: boolean
  existingChannelName: string | null
}

interface DefaultTokenQuickCreateDialogState {
  isOpen: boolean
  sessionId: number
  account: DisplaySiteData | null
  allowedGroups: string[]
  notice?: string
  onSuccessCallback?: ((createdToken?: ApiToken) => void | Promise<void>) | null
}

interface ChannelDialogContextValue {
  state: ChannelDialogState
  duplicateChannelWarning: DuplicateChannelWarningState
  defaultTokenQuickCreateDialog: DefaultTokenQuickCreateDialogState
  openDialog: (config: {
    mode?: DialogMode
    channel?: ManagedSiteChannel | null
    initialValues?: Partial<ChannelFormData>
    initialModels?: string[]
    initialGroups?: string[]
    showModelPrefillWarning?: boolean
    advisoryWarning?: ChannelDialogAdvisoryWarning | null
    onRequestRealKey?: (options: {
      setKey: (key: string) => void
    }) => Promise<void>
    onSuccess?: (result: any) => void
    onMutationOutcome?: ChannelDialogMutationOutcomeHandler
    resourceEdit?: ChannelResourceEditContext | null
  }) => void
  closeDialog: () => void
  handleSuccess: (result: any) => void
  openDefaultTokenQuickCreateDialog: (config: {
    account: DisplaySiteData
    allowedGroups: string[]
    notice?: string
    onSuccess?: (createdToken?: ApiToken) => void | Promise<void>
  }) => void
  closeDefaultTokenQuickCreateDialog: () => void
  handleDefaultTokenQuickCreateSuccess: (
    createdToken?: ApiToken,
  ) => Promise<void>
  requestDuplicateChannelWarning: (options: {
    existingChannelName: string
  }) => Promise<boolean>
  resolveDuplicateChannelWarning: (shouldContinue: boolean) => void
}

const ChannelDialogContext = createContext<ChannelDialogContextValue | null>(
  null,
)

/**
 * Provides ChannelDialog state and helpers to descendants.
 * Stores last onSuccess callback in a ref so closures stay stable.
 */
export function ChannelDialogProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [state, setState] = useState<ChannelDialogState>({
    isOpen: false,
    mode: DIALOG_MODES.ADD,
    channel: null,
  })
  const [duplicateChannelWarning, setDuplicateChannelWarning] =
    useState<DuplicateChannelWarningState>({
      isOpen: false,
      existingChannelName: null,
    })
  const [defaultTokenQuickCreateDialog, setDefaultTokenQuickCreateDialog] =
    useState<DefaultTokenQuickCreateDialogState>({
      isOpen: false,
      sessionId: 0,
      account: null,
      allowedGroups: [],
      notice: undefined,
      onSuccessCallback: null,
    })
  const defaultTokenQuickCreateDialogSessionIdRef = useRef(
    defaultTokenQuickCreateDialog.sessionId,
  )
  const defaultTokenQuickCreateOnSuccessRef = useRef(
    defaultTokenQuickCreateDialog.onSuccessCallback,
  )

  const openDialog = useCallback(
    (config: {
      mode?: DialogMode
      channel?: ManagedSiteChannel | null
      initialValues?: Partial<ChannelFormData>
      initialModels?: string[]
      initialGroups?: string[]
      showModelPrefillWarning?: boolean
      advisoryWarning?: ChannelDialogAdvisoryWarning | null
      onRequestRealKey?: (options: {
        setKey: (key: string) => void
      }) => Promise<void>
      onSuccess?: (result: any) => void
      onMutationOutcome?: ChannelDialogMutationOutcomeHandler
      resourceEdit?: ChannelResourceEditContext | null
    }) => {
      setState({
        isOpen: true,
        mode: config.mode ?? DIALOG_MODES.ADD,
        channel: config.channel ?? null,
        initialValues: config.initialValues,
        initialModels: config.initialModels,
        initialGroups: config.initialGroups,
        showModelPrefillWarning: config.showModelPrefillWarning ?? false,
        advisoryWarning: config.advisoryWarning ?? null,
        onRequestRealKey: config.onRequestRealKey ?? null,
        onSuccessCallback: config.onSuccess,
        onMutationOutcome: config.onMutationOutcome ?? null,
        resourceEdit: config.resourceEdit ?? null,
      })
    },
    [],
  )

  const closeDialog = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isOpen: false,
    }))
  }, [])

  const onSuccessRef = useRef(state.onSuccessCallback)

  useEffect(() => {
    onSuccessRef.current = state.onSuccessCallback
  }, [state.onSuccessCallback])

  const handleSuccess = useCallback(
    (result: any) => {
      onSuccessRef.current?.(result)
      closeDialog()
    },
    [closeDialog],
  )

  const openDefaultTokenQuickCreateDialog = useCallback(
    (config: {
      account: DisplaySiteData
      allowedGroups: string[]
      notice?: string
      onSuccess?: (createdToken?: ApiToken) => void | Promise<void>
    }) => {
      const nextSessionId =
        defaultTokenQuickCreateDialogSessionIdRef.current + 1
      const nextOnSuccess = config.onSuccess ?? null
      defaultTokenQuickCreateDialogSessionIdRef.current = nextSessionId
      defaultTokenQuickCreateOnSuccessRef.current = nextOnSuccess
      setDefaultTokenQuickCreateDialog(() => ({
        isOpen: true,
        sessionId: nextSessionId,
        account: config.account,
        allowedGroups: config.allowedGroups,
        notice: config.notice,
        onSuccessCallback: nextOnSuccess,
      }))
    },
    [],
  )

  const closeDefaultTokenQuickCreateDialog = useCallback(() => {
    const nextSessionId = defaultTokenQuickCreateDialogSessionIdRef.current + 1
    defaultTokenQuickCreateDialogSessionIdRef.current = nextSessionId
    defaultTokenQuickCreateOnSuccessRef.current = null
    setDefaultTokenQuickCreateDialog(() => ({
      isOpen: false,
      sessionId: nextSessionId,
      account: null,
      allowedGroups: [],
      notice: undefined,
      onSuccessCallback: null,
    }))
  }, [])

  const handleDefaultTokenQuickCreateSuccess = useCallback(
    async (createdToken?: ApiToken) => {
      const sessionIdAtInvocation = defaultTokenQuickCreateDialog.sessionId
      if (!defaultTokenQuickCreateDialog.isOpen) {
        return
      }

      if (
        defaultTokenQuickCreateDialogSessionIdRef.current !==
        sessionIdAtInvocation
      ) {
        return
      }

      const callback = defaultTokenQuickCreateOnSuccessRef.current
      closeDefaultTokenQuickCreateDialog()
      await callback?.(createdToken)
    },
    [
      closeDefaultTokenQuickCreateDialog,
      defaultTokenQuickCreateDialog.isOpen,
      defaultTokenQuickCreateDialog.sessionId,
    ],
  )

  const duplicateWarningResolverRef = useRef<
    ((shouldContinue: boolean) => void) | null
  >(null)

  useEffect(() => {
    return () => {
      duplicateWarningResolverRef.current?.(false)
      duplicateWarningResolverRef.current = null
    }
  }, [])

  const requestDuplicateChannelWarning = useCallback(
    async (options: { existingChannelName: string }) => {
      if (duplicateWarningResolverRef.current) {
        duplicateWarningResolverRef.current(false)
        duplicateWarningResolverRef.current = null
      }

      setDuplicateChannelWarning({
        isOpen: true,
        existingChannelName: options.existingChannelName,
      })

      return await new Promise<boolean>((resolve) => {
        duplicateWarningResolverRef.current = resolve
      })
    },
    [],
  )

  const resolveDuplicateChannelWarning = useCallback(
    (shouldContinue: boolean) => {
      duplicateWarningResolverRef.current?.(shouldContinue)
      duplicateWarningResolverRef.current = null
      setDuplicateChannelWarning({
        isOpen: false,
        existingChannelName: null,
      })
    },
    [],
  )

  return (
    <ChannelDialogContext.Provider
      value={{
        state,
        duplicateChannelWarning,
        defaultTokenQuickCreateDialog,
        openDialog,
        closeDialog,
        handleSuccess,
        openDefaultTokenQuickCreateDialog,
        closeDefaultTokenQuickCreateDialog,
        handleDefaultTokenQuickCreateSuccess,
        requestDuplicateChannelWarning,
        resolveDuplicateChannelWarning,
      }}
    >
      {children}
    </ChannelDialogContext.Provider>
  )
}

/**
 * Hook to access ChannelDialog context safely.
 * Throws when called outside ChannelDialogProvider to surface wiring bugs.
 */
export function useChannelDialogContext() {
  const context = useContext(ChannelDialogContext)
  if (!context) {
    throw new Error(
      "useChannelDialogContext must be used within a ChannelDialogProvider",
    )
  }
  return context
}
