import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react"

import { DIALOG_MODES, type DialogMode } from "~/constants/dialogModes"
import type { ChannelFormData, ManagedSiteChannel } from "~/types/managedSite"

interface ChannelDialogState {
  isOpen: boolean
  mode: DialogMode
  channel?: ManagedSiteChannel | null
  initialValues?: Partial<ChannelFormData>
  initialModels?: string[]
  initialGroups?: string[]
  onSuccessCallback?: (result: any) => void
}

interface DuplicateChannelWarningState {
  isOpen: boolean
  existingChannelName: string | null
}

interface ChannelDialogContextValue {
  state: ChannelDialogState
  duplicateChannelWarning: DuplicateChannelWarningState
  openDialog: (config: {
    mode?: DialogMode
    channel?: ManagedSiteChannel | null
    initialValues?: Partial<ChannelFormData>
    initialModels?: string[]
    initialGroups?: string[]
    onSuccess?: (result: any) => void
  }) => void
  closeDialog: () => void
  handleSuccess: (result: any) => void
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

  const openDialog = useCallback(
    (config: {
      mode?: DialogMode
      channel?: ManagedSiteChannel | null
      initialValues?: Partial<ChannelFormData>
      initialModels?: string[]
      initialGroups?: string[]
      onSuccess?: (result: any) => void
    }) => {
      setState({
        isOpen: true,
        mode: config.mode ?? DIALOG_MODES.ADD,
        channel: config.channel ?? null,
        initialValues: config.initialValues,
        initialModels: config.initialModels,
        initialGroups: config.initialGroups,
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
        openDialog,
        closeDialog,
        handleSuccess,
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
