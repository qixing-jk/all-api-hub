import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react"

import { DIALOG_MODES, type DialogMode } from "~/constants/dialogModes"
import type { ManagedSiteChannelAssessmentSignals } from "~/services/managedSites/channelAssessmentSignals"
import type { ApiToken, DisplaySiteData } from "~/types"
import type { ChannelFormData, ManagedSiteChannel } from "~/types/managedSite"

type ChannelDialogMutationOutcomeHandler = (outcome: {
  mode: DialogMode
  result: "success" | "failure"
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
}

interface DuplicateChannelWarningState {
  isOpen: boolean
  existingChannelName: string | null
}

interface Sub2ApiTokenDialogState {
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
  sub2apiTokenDialog: Sub2ApiTokenDialogState
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
  }) => void
  closeDialog: () => void
  handleSuccess: (result: any) => void
  openSub2ApiTokenDialog: (config: {
    account: DisplaySiteData
    allowedGroups: string[]
    notice?: string
    onSuccess?: (createdToken?: ApiToken) => void | Promise<void>
  }) => void
  closeSub2ApiTokenDialog: () => void
  handleSub2ApiTokenSuccess: (createdToken?: ApiToken) => Promise<void>
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
  const [sub2apiTokenDialog, setSub2apiTokenDialog] =
    useState<Sub2ApiTokenDialogState>({
      isOpen: false,
      sessionId: 0,
      account: null,
      allowedGroups: [],
      notice: undefined,
      onSuccessCallback: null,
    })
  const sub2apiTokenDialogSessionIdRef = useRef(sub2apiTokenDialog.sessionId)
  const sub2apiTokenOnSuccessRef = useRef(sub2apiTokenDialog.onSuccessCallback)

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

  const openSub2ApiTokenDialog = useCallback(
    (config: {
      account: DisplaySiteData
      allowedGroups: string[]
      notice?: string
      onSuccess?: (createdToken?: ApiToken) => void | Promise<void>
    }) => {
      const nextSessionId = sub2apiTokenDialogSessionIdRef.current + 1
      const nextOnSuccess = config.onSuccess ?? null
      sub2apiTokenDialogSessionIdRef.current = nextSessionId
      sub2apiTokenOnSuccessRef.current = nextOnSuccess
      setSub2apiTokenDialog(() => ({
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

  const closeSub2ApiTokenDialog = useCallback(() => {
    const nextSessionId = sub2apiTokenDialogSessionIdRef.current + 1
    sub2apiTokenDialogSessionIdRef.current = nextSessionId
    sub2apiTokenOnSuccessRef.current = null
    setSub2apiTokenDialog(() => ({
      isOpen: false,
      sessionId: nextSessionId,
      account: null,
      allowedGroups: [],
      notice: undefined,
      onSuccessCallback: null,
    }))
  }, [])

  const handleSub2ApiTokenSuccess = useCallback(
    async (createdToken?: ApiToken) => {
      const sessionIdAtInvocation = sub2apiTokenDialog.sessionId
      if (!sub2apiTokenDialog.isOpen) {
        return
      }

      if (sub2apiTokenDialogSessionIdRef.current !== sessionIdAtInvocation) {
        return
      }

      const callback = sub2apiTokenOnSuccessRef.current
      closeSub2ApiTokenDialog()
      await callback?.(createdToken)
    },
    [
      closeSub2ApiTokenDialog,
      sub2apiTokenDialog.isOpen,
      sub2apiTokenDialog.sessionId,
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
        sub2apiTokenDialog,
        openDialog,
        closeDialog,
        handleSuccess,
        openSub2ApiTokenDialog,
        closeSub2ApiTokenDialog,
        handleSub2ApiTokenSuccess,
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
