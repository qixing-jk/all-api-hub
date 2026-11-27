import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"

import { MODAL_BODY_SELECTOR } from "~/components/ui/Dialog/Modal"
import {
  ACCOUNT_EDIT_SECTIONS,
  ACCOUNT_FORM_SECTION_ELEMENT_IDS,
  ACCOUNT_FORM_SECTIONS,
  type AccountFormSectionId,
} from "~/features/AccountManagement/components/AccountDialog/form/accountFormSections"
import { useMediaQuery } from "~/hooks/useMediaQuery"
import type { AccountFormIssue } from "~/services/accounts/editing/accountFormValidation"
import { resolveNavigationScrollBehavior } from "~/utils/dom/scrollBehavior"
import { temporarilyHighlight } from "~/utils/dom/temporaryHighlight"

import { AccountFormNavigation } from "./AccountFormNavigation"

/** Leave space below the horizontal directory, which meets the modal header. */
function getTopInset(navigation: HTMLElement | null) {
  return window.matchMedia("(min-width: 1024px)").matches
    ? 12
    : (navigation?.offsetHeight ?? 0) + 12
}

/** Continuous account form; the modal body remains the only vertical scroller. */
export function AccountFormLayout({
  continuous,
  children,
  guidance,
  focusSection,
  formRef,
  onBlurField,
  issueSections,
  hasAccountLogin = false,
}: {
  continuous: boolean
  children: ReactNode
  guidance?: ReactNode
  /**
   * Section the dialog was opened for. It becomes the initial destination and
   * its navigation entry stays selected, so a guidance button that opened the
   * dialog lands on the control it is asking the user to fix.
   */
  focusSection?: AccountFormSectionId
  hasAccountLogin?: boolean
  formRef?: React.RefObject<HTMLDivElement | null>
  onBlurField?: (element: HTMLElement) => void
  issueSections?: Partial<Record<string, AccountFormIssue["kind"]>>
}) {
  const showGuidanceInDirectory = useMediaQuery(
    "(min-width: 1024px) and (min-height: 800px)",
  )
  const internalRootRef = useRef<HTMLDivElement>(null)
  const rootRef = formRef ?? internalRootRef
  const navigationRef = useRef<HTMLElement>(null)
  const directoryRef = useRef<HTMLDivElement>(null)
  const sections = useMemo(
    () =>
      ACCOUNT_EDIT_SECTIONS.filter(
        ({ id }) =>
          hasAccountLogin ||
          id !== ACCOUNT_FORM_SECTION_ELEMENT_IDS[ACCOUNT_FORM_SECTIONS.LOGIN],
      ),
    [hasAccountLogin],
  )
  const requestedSectionId = focusSection
    ? ACCOUNT_FORM_SECTION_ELEMENT_IDS[focusSection]
    : undefined
  const [activeId, setActiveId] = useState<string>(
    requestedSectionId ?? sections[0]!.id,
  )
  const navigationSelection = useRef<string | null>(null)
  const pendingMenuDestination = useRef<string | null>(null)
  const destinationAnimation = useRef<Animation | null>(null)
  useEffect(() => () => destinationAnimation.current?.cancel(), [])

  useEffect(() => {
    if (sections.some(({ id }) => id === activeId)) return
    navigationSelection.current = null
    pendingMenuDestination.current = null
    destinationAnimation.current?.cancel()
    setActiveId(sections[0]!.id)
  }, [activeId, sections])

  useEffect(() => {
    const navigation = navigationRef.current
    if (!navigation) return
    const reveal = () => {
      const active = navigation.querySelector<HTMLElement>(
        '[aria-current="location"]',
      )
      if (!active) return
      const bounds = navigation.getBoundingClientRect()
      const button = active.getBoundingClientRect()
      if (button.left < bounds.left)
        navigation.scrollLeft += button.left - bounds.left
      else if (button.right > bounds.right)
        navigation.scrollLeft += button.right - bounds.right
    }
    reveal()
    window.addEventListener("resize", reveal)
    return () => window.removeEventListener("resize", reveal)
  }, [activeId])

  useEffect(() => {
    if (!continuous) return
    const root = rootRef.current
    const scroller = root?.closest<HTMLElement>(MODAL_BODY_SELECTOR)
    if (!root || !scroller) return
    const update = () => {
      // An explicit destination stays selected through animation and resize.
      // Manual scroll input returns ownership to the scroll tracker.
      if (navigationSelection.current !== null) return
      const top =
        scroller.getBoundingClientRect().top +
        getTopInset(directoryRef.current) +
        1
      let current: string = sections[0]!.id
      for (const section of sections) {
        const element = root.querySelector<HTMLElement>(`#${section.id}`)
        if (element && element.getBoundingClientRect().top <= top)
          current = section.id
      }
      if (
        scroller.scrollTop > 0 &&
        scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1
      )
        current = sections.at(-1)?.id ?? current
      setActiveId(current)
    }
    const interrupt = () => {
      navigationSelection.current = null
    }
    scroller.addEventListener("scroll", update, { passive: true })
    scroller.addEventListener("wheel", interrupt, { passive: true })
    scroller.addEventListener("touchstart", interrupt, { passive: true })
    scroller.addEventListener("pointerdown", interrupt)
    scroller.addEventListener("keydown", interrupt)
    window.addEventListener("resize", update)
    update()
    return () => {
      scroller.removeEventListener("scroll", update)
      scroller.removeEventListener("wheel", interrupt)
      scroller.removeEventListener("touchstart", interrupt)
      scroller.removeEventListener("pointerdown", interrupt)
      scroller.removeEventListener("keydown", interrupt)
      window.removeEventListener("resize", update)
    }
  }, [continuous, rootRef, sections])

  const navigate = useCallback(
    (id: string) => {
      const root = rootRef.current
      const target = root?.querySelector<HTMLElement>(`#${id}`)
      const scroller = root?.closest<HTMLElement>(MODAL_BODY_SELECTOR)
      if (!target) return
      navigationSelection.current = id
      if (scroller) {
        const destination =
          scroller.scrollTop +
          target.getBoundingClientRect().top -
          scroller.getBoundingClientRect().top -
          getTopInset(directoryRef.current)
        scroller.scrollTo({
          top: Math.max(
            0,
            Math.min(
              destination,
              scroller.scrollHeight - scroller.clientHeight,
            ),
          ),
          behavior: resolveNavigationScrollBehavior(),
        })
      }
      setActiveId(id)
      target.querySelector<HTMLElement>("h3")?.focus({ preventScroll: true })
      destinationAnimation.current?.cancel()
      destinationAnimation.current =
        target
          .querySelector<HTMLElement>("[data-navigation-feedback]")
          ?.animate?.(
            [
              { opacity: 1, offset: 0 },
              { opacity: 1, offset: 0.3 },
              { opacity: 0, offset: 1 },
            ],
            { duration: 1800, easing: "ease-out" },
          ) ?? null
    },
    [rootRef],
  )

  /**
   * Land on the section the dialog was opened for.
   *
   * A guidance button that opens the editor is asking for one specific field, so
   * the request has to survive the modal's own scroll and focus setup instead of
   * leaving the user at the top of a long form. It reuses the directory's own
   * destination logic and adds the highlight the user follows.
   */
  useEffect(() => {
    if (!requestedSectionId) return
    const target = rootRef.current?.querySelector<HTMLElement>(
      `#${requestedSectionId}`,
    )
    if (!target) return
    navigate(requestedSectionId)
    return temporarilyHighlight(target)
  }, [navigate, requestedSectionId, rootRef])

  if (!continuous) {
    return (
      <div
        ref={rootRef}
        className="space-y-density-3"
        onBlurCapture={(event) => onBlurField?.(event.target)}
      >
        {children}
      </div>
    )
  }

  return (
    <div
      ref={rootRef}
      onBlurCapture={(event) => onBlurField?.(event.target)}
      className="relative grid min-w-0 gap-4 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-6"
      onFocusCapture={(event) => {
        const section = event.target.closest<HTMLElement>(
          "[data-account-form-section]",
        )
        if (!section) return
        const id = section.id
        if (sections.some((entry) => entry.id === id)) {
          navigationSelection.current = id
          setActiveId(id)
        }
      }}
    >
      <aside className="sticky -top-density-4 z-10 -mx-4 -mt-density-4 min-w-0 border-b border-border bg-popover px-4 sm:-top-density-6 sm:-mx-6 sm:-mt-density-6 sm:px-6 lg:static lg:top-0 lg:mx-0 lg:mt-0 lg:border-r lg:border-b-0 lg:px-0 lg:pr-4">
        <div
          ref={directoryRef}
          className="flex min-w-0 items-center bg-popover lg:sticky lg:top-0 lg:flex-col lg:items-stretch"
        >
          <AccountFormNavigation
            navigationRef={navigationRef}
            sections={sections}
            activeId={activeId}
            issueSections={issueSections}
            pendingMenuDestination={pendingMenuDestination}
            navigate={navigate}
          />
          {guidance && showGuidanceInDirectory && (
            <div className="mt-density-4 border-t border-border pt-density-3">
              {guidance}
            </div>
          )}
        </div>
      </aside>
      <div className="min-w-0">
        {children}
        {guidance && !showGuidanceInDirectory && (
          <div className="border-t border-border pt-density-4">{guidance}</div>
        )}
      </div>
    </div>
  )
}
