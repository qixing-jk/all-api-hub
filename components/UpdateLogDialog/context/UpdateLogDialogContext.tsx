import React, { createContext, useCallback, useContext, useState } from "react"

interface UpdateLogDialogState {
  isOpen: boolean
  version: string | null
}

interface UpdateLogDialogContextValue {
  state: UpdateLogDialogState
  openDialog: (version: string) => void
  closeDialog: () => void
}

const UpdateLogDialogContext =
  createContext<UpdateLogDialogContextValue | null>(null)

/**
 *
 */
export function UpdateLogDialogProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [state, setState] = useState<UpdateLogDialogState>({
    isOpen: false,
    version: null,
  })

  const openDialog = useCallback((version: string) => {
    const trimmed = version.trim()
    if (!trimmed) return

    setState({
      isOpen: true,
      version: trimmed,
    })
  }, [])

  const closeDialog = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isOpen: false,
    }))
  }, [])

  return (
    <UpdateLogDialogContext.Provider value={{ state, openDialog, closeDialog }}>
      {children}
    </UpdateLogDialogContext.Provider>
  )
}

/**
 *
 */
export function useUpdateLogDialogContext() {
  const context = useContext(UpdateLogDialogContext)
  if (!context) {
    throw new Error(
      "useUpdateLogDialogContext must be used within an UpdateLogDialogProvider",
    )
  }
  return context
}
