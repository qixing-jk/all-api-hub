import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react"

import { DIALOG_MODES, type DialogMode } from "~/constants/dialogModes"
import type { ChannelFormData, NewApiChannel } from "~/types/newapi"

interface ChannelDialogState {
  isOpen: boolean
  mode: DialogMode
  channel?: NewApiChannel | null
  initialValues?: Partial<ChannelFormData>
  initialModels?: string[]
  initialGroups?: string[]
  onSuccessCallback?: (result: any) => void
}

interface ChannelDialogContextValue {
  state: ChannelDialogState
  openDialog: (config: {
    mode?: DialogMode
    channel?: NewApiChannel | null
    initialValues?: Partial<ChannelFormData>
    initialModels?: string[]
    initialGroups?: string[]
    onSuccess?: (result: any) => void
  }) => void
  closeDialog: () => void
  handleSuccess: (result: any) => void
}

const ChannelDialogContext = createContext<ChannelDialogContextValue | null>(
  null,
)

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

  const openDialog = useCallback(
    (config: {
      mode?: DialogMode
      channel?: NewApiChannel | null
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

  return (
    <ChannelDialogContext.Provider
      value={{ state, openDialog, closeDialog, handleSuccess }}
    >
      {children}
    </ChannelDialogContext.Provider>
  )
}

export function useChannelDialogContext() {
  const context = useContext(ChannelDialogContext)
  if (!context) {
    throw new Error(
      "useChannelDialogContext must be used within a ChannelDialogProvider",
    )
  }
  return context
}
