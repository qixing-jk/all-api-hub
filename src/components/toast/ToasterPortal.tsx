import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react"

const ToasterPortalActiveHostContext = createContext<HTMLElement | null>(null)
const ToasterPortalRegisterContext = createContext<
  ((host: HTMLElement) => () => void) | null
>(null)

interface ToasterPortalProviderProps {
  children: ReactNode
}

/**
 * Tracks modal-local toaster hosts so the single global toaster can stay
 * inside the active dialog portal instead of the inert app tree.
 */
export function ToasterPortalProvider({
  children,
}: ToasterPortalProviderProps) {
  const [hosts, setHosts] = useState<HTMLElement[]>([])

  const registerHost = useCallback((host: HTMLElement) => {
    setHosts((currentHosts) =>
      currentHosts.includes(host) ? currentHosts : [...currentHosts, host],
    )

    return () => {
      setHosts((currentHosts) =>
        currentHosts.filter((currentHost) => currentHost !== host),
      )
    }
  }, [])

  return (
    <ToasterPortalRegisterContext.Provider value={registerHost}>
      <ToasterPortalActiveHostContext.Provider value={hosts.at(-1) ?? null}>
        {children}
      </ToasterPortalActiveHostContext.Provider>
    </ToasterPortalRegisterContext.Provider>
  )
}

/**
 * Modal-local mount point for the global toaster.
 */
export function ToasterPortalHost() {
  const registerHost = useContext(ToasterPortalRegisterContext)
  const [host, setHost] = useState<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!registerHost || !host) {
      return undefined
    }

    return registerHost(host)
  }, [host, registerHost])

  return <div ref={setHost} data-slot="toaster-portal-host" />
}

/**
 * Returns the currently active modal toaster host, if a modal is open.
 */
export function useToasterPortalHost() {
  return useContext(ToasterPortalActiveHostContext)
}
