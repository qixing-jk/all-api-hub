import { ChevronDown } from "lucide-react"
import { useEffect, useRef, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "~/components/ui"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import { ACCOUNT_EDIT_SECTIONS } from "~/features/AccountManagement/components/AccountDialog/form/accountFormSections"
import { useMediaQuery } from "~/hooks/useMediaQuery"
import { cn } from "~/lib/utils"

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
}: {
  continuous: boolean
  children: ReactNode
  guidance?: ReactNode
}) {
  const { t } = useTranslation("accountDialog")
  const isCompact = useMediaQuery("(max-width: 639px)")
  const showGuidanceInDirectory = useMediaQuery(
    "(min-width: 1024px) and (min-height: 800px)",
  )
  const rootRef = useRef<HTMLDivElement>(null)
  const navigationRef = useRef<HTMLElement>(null)
  const directoryRef = useRef<HTMLDivElement>(null)
  const [activeId, setActiveId] = useState<string>(ACCOUNT_EDIT_SECTIONS[0].id)
  const navigationSelection = useRef<string | null>(null)
  const pendingMenuDestination = useRef<string | null>(null)
  const destinationAnimation = useRef<Animation | null>(null)
  useEffect(() => () => destinationAnimation.current?.cancel(), [])

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
    const scroller = root?.closest<HTMLElement>('[data-slot="modal-body"]')
    if (!root || !scroller) return
    const update = () => {
      // An explicit destination stays selected through animation and resize.
      // Manual scroll input returns ownership to the scroll tracker.
      if (navigationSelection.current !== null) return
      const top =
        scroller.getBoundingClientRect().top +
        getTopInset(directoryRef.current) +
        1
      let current: string = ACCOUNT_EDIT_SECTIONS[0].id
      for (const section of ACCOUNT_EDIT_SECTIONS) {
        const element = root.querySelector<HTMLElement>(`#${section.id}`)
        if (element && element.getBoundingClientRect().top <= top)
          current = section.id
      }
      if (
        scroller.scrollTop > 0 &&
        scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1
      )
        current = ACCOUNT_EDIT_SECTIONS.at(-1)?.id ?? current
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
  }, [continuous])

  const navigate = (id: string) => {
    const root = rootRef.current
    const target = root?.querySelector<HTMLElement>(`#${id}`)
    const scroller = root?.closest<HTMLElement>('[data-slot="modal-body"]')
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
          Math.min(destination, scroller.scrollHeight - scroller.clientHeight),
        ),
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
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
  }

  if (!continuous) return <div className="space-y-density-3">{children}</div>

  return (
    <div
      ref={rootRef}
      className="relative grid min-w-0 gap-4 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-6"
      onFocusCapture={(event) => {
        const section = event.target.closest<HTMLElement>(
          "[data-account-form-section]",
        )
        if (!section) return
        const id =
          section.id === "account-login-config"
            ? "account-check-in-config"
            : section.id
        if (ACCOUNT_EDIT_SECTIONS.some((entry) => entry.id === id)) {
          navigationSelection.current = id
          setActiveId(id)
        }
      }}
    >
      <aside className="bg-popover border-border -top-density-4 -mt-density-4 sm:-top-density-6 sm:-mt-density-6 sticky z-10 -mx-4 min-w-0 border-b px-4 sm:-mx-6 sm:px-6 lg:static lg:top-0 lg:mx-0 lg:mt-0 lg:border-r lg:border-b-0 lg:px-0 lg:pr-4">
        <div
          ref={directoryRef}
          className="bg-popover flex min-w-0 items-center lg:sticky lg:top-0 lg:flex-col lg:items-stretch"
        >
          <nav
            ref={navigationRef}
            aria-label={t("sections.navigation")}
            className="py-density-2 flex min-w-0 flex-1 gap-1 overflow-x-auto lg:flex-col lg:overflow-visible lg:py-0"
          >
            {isCompact ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-between"
                    aria-label={t("sections.navigation")}
                    rightIcon={<ChevronDown className="size-4" />}
                  >
                    {ACCOUNT_EDIT_SECTIONS.filter(
                      ({ id }) => id === activeId,
                    ).map(({ id, title, icon: Icon }) => (
                      <span key={id} className="flex items-center gap-2.5">
                        <Icon aria-hidden="true" className="size-4 shrink-0" />
                        {t(title)}
                      </span>
                    ))}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="w-(--radix-dropdown-menu-trigger-width)"
                  onCloseAutoFocus={(event) => {
                    const destination = pendingMenuDestination.current
                    if (!destination) return
                    event.preventDefault()
                    pendingMenuDestination.current = null
                    navigate(destination)
                  }}
                >
                  {ACCOUNT_EDIT_SECTIONS.map(({ id, title, icon: Icon }) => (
                    <DropdownMenuItem
                      key={id}
                      aria-current={activeId === id ? "location" : undefined}
                      onSelect={() => {
                        pendingMenuDestination.current = id
                      }}
                    >
                      <Icon aria-hidden="true" className="size-4 shrink-0" />
                      {t(title)}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              ACCOUNT_EDIT_SECTIONS.map(({ id, title, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  aria-controls={id}
                  aria-current={activeId === id ? "location" : undefined}
                  onClick={() => navigate(id)}
                  className={cn(
                    "focus-visible:ring-ring py-density-2 active:bg-primary-soft flex min-h-10 shrink-0 items-center gap-2.5 rounded-lg px-3 text-left text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset motion-reduce:transition-none lg:shrink lg:break-words",
                    activeId === id
                      ? "bg-primary-soft text-primary-soft-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  )}
                >
                  <Icon aria-hidden="true" className="size-4 shrink-0" />
                  {t(title)}
                </button>
              ))
            )}
          </nav>
          {guidance && showGuidanceInDirectory && (
            <div className="border-border mt-density-4 pt-density-3 border-t">
              {guidance}
            </div>
          )}
        </div>
      </aside>
      <div className="min-w-0">
        {children}
        {guidance && !showGuidanceInDirectory && (
          <div className="border-border pt-density-4 border-t">{guidance}</div>
        )}
      </div>
    </div>
  )
}
