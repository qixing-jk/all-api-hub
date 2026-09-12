import { useEffect, useState } from "react"

import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"

import {
  GATEWAY_GUIDANCE_OVERVIEW_ID,
  GATEWAY_GUIDANCE_QUERY_PARAM,
} from "./navigation"

/** Reads only the overview-owned preview request. */
function hasPreviewRequest() {
  const url = new URL(window.location.href)
  return (
    url.hash === `#${MENU_ITEM_IDS.OVERVIEW}` &&
    url.searchParams.get(GATEWAY_GUIDANCE_QUERY_PARAM) === "1"
  )
}

const STORAGE_KEY = "gatewayGuidance.overview.presentation"

interface PresentationChoice {
  expanded: boolean
  completed: boolean
}

/** Reads a valid saved presentation choice, tolerating unavailable storage. */
function readChoice(): PresentationChoice | null {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null")
    return value &&
      typeof value.expanded === "boolean" &&
      typeof value.completed === "boolean"
      ? value
      : null
  } catch {
    return null
  }
}

/** Persistence failure must not block the current page interaction. */
function saveChoice(choice: PresentationChoice) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(choice))
  } catch {
    // Keep the current in-memory choice when storage is unavailable.
  }
}

/** Remembers an explicit choice while letting newly completed setup leave the page. */
export function useGatewayGuidancePresentation(
  completed: boolean,
  started: boolean,
  ready = true,
) {
  const [choice, setChoice] = useState(readChoice)
  const [previewRequested, setPreviewRequested] = useState(hasPreviewRequest)
  useEffect(() => {
    const readRequest = () => setPreviewRequested(hasPreviewRequest())
    window.addEventListener("popstate", readRequest)
    window.addEventListener("hashchange", readRequest)
    return () => {
      window.removeEventListener("popstate", readRequest)
      window.removeEventListener("hashchange", readRequest)
    }
  }, [])
  useEffect(() => {
    if (!previewRequested || !ready) return
    const guide = document.getElementById(GATEWAY_GUIDANCE_OVERVIEW_ID)
    if (!guide) return
    guide.scrollIntoView({ block: "start" })
    guide.focus({ preventScroll: true })
    const next = { completed, expanded: true }
    setChoice(next)
    saveChoice(next)
    const url = new URL(window.location.href)
    url.searchParams.delete(GATEWAY_GUIDANCE_QUERY_PARAM)
    window.history.replaceState(window.history.state, "", url.toString())
    setPreviewRequested(false)
  }, [previewRequested, ready, completed])
  const expanded =
    (previewRequested && ready) ||
    (choice?.completed === completed ? choice.expanded : started && !completed)

  const toggle = () => {
    const next = { completed, expanded: !expanded }
    setChoice(next)
    saveChoice(next)
  }

  return { expanded, started, toggle }
}
