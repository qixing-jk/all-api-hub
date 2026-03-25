import * as React from "react"

import { Z_INDEX } from "~/constants/designTokens"

type FloatingLayer = "page" | "modal-contained"

const FloatingLayerContext = React.createContext<FloatingLayer>("page")

interface FloatingLayerProviderProps {
  layer: FloatingLayer
  children: React.ReactNode
}

/**
 * Provides the floating-layer role for descendants, including portal content.
 */
export function FloatingLayerProvider({
  layer,
  children,
}: FloatingLayerProviderProps) {
  return (
    <FloatingLayerContext.Provider value={layer}>
      {children}
    </FloatingLayerContext.Provider>
  )
}

/**
 * Resolves the shared z-index class for the current floating-layer role.
 */
export function useFloatingLayerClass() {
  const layer = React.useContext(FloatingLayerContext)

  // React portals preserve context, so modal-hosted floaters can lift above the
  // dialog surface without per-feature z-index overrides.
  return layer === "modal-contained" ? Z_INDEX.modalFloating : Z_INDEX.floating
}
