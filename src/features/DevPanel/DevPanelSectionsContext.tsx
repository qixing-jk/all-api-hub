import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"

import type {
  DevPanelContextValue,
  DevPanelSection,
  DevPanelSurface,
} from "./types"

interface DevPanelRegistryValue {
  register: (section: DevPanelSection) => void
  unregister: (sectionId: string) => void
}

const DevPanelRegistryContext = createContext<DevPanelRegistryValue | null>(
  null,
)

const DevPanelSurfaceContext = createContext<DevPanelContextValue>({
  surface: "options",
})

const DevPanelSectionsContext = createContext<readonly DevPanelSection[]>([])

/**
 * Holds the registry and routing context for the floating dev panel.
 *
 * Sections register from wherever their handlers live (the panel itself for
 * static sections, feature pages for page-scoped actions), so the panel only
 * reads state. Registry and section-list contexts are separate so section
 * updates re-render only the panel, not pages that merely register sections.
 */
export function DevPanelProvider(props: {
  surface: DevPanelSurface
  /** Active page id used to filter page-scoped sections. */
  page?: string
  children: ReactNode
}) {
  const { surface, page, children } = props
  const sectionsByIdRef = useRef(new Map<string, DevPanelSection>())
  const [sections, setSections] = useState<readonly DevPanelSection[]>([])

  const syncSections = useCallback(() => {
    setSections(Array.from(sectionsByIdRef.current.values()))
  }, [])

  const register = useCallback(
    (section: DevPanelSection) => {
      sectionsByIdRef.current.set(section.id, section)
      syncSections()
    },
    [syncSections],
  )

  const unregister = useCallback(
    (sectionId: string) => {
      if (sectionsByIdRef.current.delete(sectionId)) {
        syncSections()
      }
    },
    [syncSections],
  )

  const registryValue = useMemo(
    () => ({ register, unregister }),
    [register, unregister],
  )
  const surfaceValue = useMemo(() => ({ surface, page }), [surface, page])

  return (
    <DevPanelRegistryContext.Provider value={registryValue}>
      <DevPanelSurfaceContext.Provider value={surfaceValue}>
        <DevPanelSectionsContext.Provider value={sections}>
          {children}
        </DevPanelSectionsContext.Provider>
      </DevPanelSurfaceContext.Provider>
    </DevPanelRegistryContext.Provider>
  )
}

/** Current dev panel routing context (surface + active page). */
export function useDevPanelSurface(): DevPanelContextValue {
  return useContext(DevPanelSurfaceContext)
}

/**
 * Registers a dev panel section for as long as the calling component stays
 * mounted. Passing `null` (for example outside development mode) is a no-op,
 * as is calling outside a provider (keeps pages testable in isolation).
 * The section object is re-registered whenever its identity changes so
 * loading/disabled states stay live in the panel.
 */
export function useRegisterDevPanelSection(
  section: DevPanelSection | null,
): void {
  const registry = useContext(DevPanelRegistryContext)

  useEffect(() => {
    if (!section || !registry) {
      return
    }

    registry.register(section)
    return () => registry.unregister(section.id)
  }, [registry, section])
}

/** All currently registered sections, ordered for display. */
export function useDevPanelSections(): readonly DevPanelSection[] {
  const sections = useContext(DevPanelSectionsContext)

  return useMemo(
    () =>
      [...sections].sort(
        (left, right) =>
          (left.order ?? 0) - (right.order ?? 0) ||
          left.id.localeCompare(right.id),
      ),
    [sections],
  )
}
