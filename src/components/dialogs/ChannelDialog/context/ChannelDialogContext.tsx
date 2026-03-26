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
import type { DisplaySiteData } from "~/types"
import type { ChannelFormData, ManagedSiteChannel } from "~/types/managedSite"

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
}

interface DuplicateChannelWarningState {
  isOpen: boolean
  existingChannelName: string | null
}

interface Sub2ApiTokenDialogState {
  isOpen: boolean
  account: DisplaySiteData | null
  allowedGroups: string[]
  notice?: string
  onSuccessCallback?: (() => void | Promise<void>) | null
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
  }) => void
  closeDialog: () => void
  handleSuccess: (result: any) => void
  openSub2ApiTokenDialog: (config: {
    account: DisplaySiteData
    allowedGroups: string[]
    notice?: string
    onSuccess?: () => void | Promise<void>
  }) => void
  closeSub2ApiTokenDialog: () => void
  handleSub2ApiTokenSuccess: () => Promise<void>
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
      account: null,
      allowedGroups: [],
      notice: undefined,
      onSuccessCallback: null,
    })

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
      onSuccess?: () => void | Promise<void>
    }) => {
      setSub2apiTokenDialog({
        isOpen: true,
        account: config.account,
        allowedGroups: config.allowedGroups,
        notice: config.notice,
        onSuccessCallback: config.onSuccess ?? null,
      })
    },
    [],
  )

  const closeSub2ApiTokenDialog = useCallback(() => {
    setSub2apiTokenDialog({
      isOpen: false,
      account: null,
      allowedGroups: [],
      notice: undefined,
      onSuccessCallback: null,
    })
  }, [])

  const sub2apiTokenOnSuccessRef = useRef(sub2apiTokenDialog.onSuccessCallback)

  useEffect(() => {
    sub2apiTokenOnSuccessRef.current = sub2apiTokenDialog.onSuccessCallback
  }, [sub2apiTokenDialog.onSuccessCallback])

  const handleSub2ApiTokenSuccess = useCallback(async () => {
    const callback = sub2apiTokenOnSuccessRef.current
    closeSub2ApiTokenDialog()
    await callback?.()
  }, [closeSub2ApiTokenDialog])

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
