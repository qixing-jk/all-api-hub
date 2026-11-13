import { Bot, Check, ChevronDown, Plus } from "lucide-react"
import * as React from "react"
import { useTranslation } from "react-i18next"

import { Button } from "~/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "~/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover"
import { Spinner } from "~/components/ui/spinner"
import { cn } from "~/lib/utils"

export type ModelOption = {
  value: string
  label: string
  group?: string
  disabled?: boolean
  suffix?: React.ReactNode
}

export interface PromptModelSelectorProps {
  value: string
  onChange: (value: string) => void
  options?: Array<string | ModelOption>
  placeholder?: string
  searchPlaceholder?: string
  emptyMessage?: string
  disabled?: boolean
  loading?: boolean
  allowCustomValue?: boolean
  portalContainer?: HTMLElement
  triggerClassName?: string
  className?: string
  "aria-label"?: string
  "data-testid"?: string
}

/**
 * Convenient all-in-one AI Elements Model Selector for conversation composers.
 * Allows quick selection from suggested models or typing a custom model ID.
 */
export function PromptModelSelector({
  value,
  onChange,
  options = [],
  placeholder,
  searchPlaceholder,
  emptyMessage,
  disabled = false,
  loading = false,
  allowCustomValue = true,
  portalContainer,
  triggerClassName,
  className,
  "aria-label": ariaLabel,
  "data-testid": testId,
}: PromptModelSelectorProps) {
  const { t } = useTranslation(["aiApiVerification", "ui"])
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")

  const normalizedOptions = React.useMemo<ModelOption[]>(() => {
    return options.map((opt) =>
      typeof opt === "string" ? { value: opt, label: opt } : opt,
    )
  }, [options])

  const selectedOption = React.useMemo(() => {
    return normalizedOptions.find((opt) => opt.value === value)
  }, [normalizedOptions, value])

  const displayedLabel =
    selectedOption?.label ||
    value ||
    placeholder ||
    t("aiApiVerification:verifyDialog.meta.modelPlaceholder") ||
    "Select model"

  const resolvedSearchPlaceholder =
    searchPlaceholder ??
    t("ui:searchableSelect.searchPlaceholder") ??
    "Search or enter model..."

  const resolvedEmptyMessage =
    emptyMessage ??
    (allowCustomValue
      ? (t("ui:searchableSelect.noOptionsAllowCustom") ??
        "No models found. Enter a model ID directly.")
      : (t("ui:searchableSelect.empty") ?? "No results found."))

  const trimmedSearch = search.trim()
  const hasExactMatch = normalizedOptions.some(
    (opt) => opt.value.toLowerCase() === trimmedSearch.toLowerCase(),
  )
  const showCustomOption = allowCustomValue && trimmedSearch && !hasExactMatch

  const customText = t("ui:searchableSelect.useValue", {
    value: trimmedSearch,
  })
  const customLabel =
    customText &&
    customText !== "ui:searchableSelect.useValue" &&
    customText.includes(trimmedSearch)
      ? customText
      : `Use "${trimmedSearch}"`

  // Group options if any option specifies a group.
  const groups = React.useMemo(() => {
    const hasGroups = normalizedOptions.some((opt) => opt.group)
    if (!hasGroups) return null
    const map = new Map<string, ModelOption[]>()
    for (const opt of normalizedOptions) {
      const g = opt.group || ""
      const list = map.get(g) ?? []
      list.push(opt)
      map.set(g, list)
    }
    return map
  }, [normalizedOptions])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          aria-label={
            ariaLabel ?? t("aiApiVerification:verifyDialog.meta.model")
          }
          data-slot="model-selector-trigger"
          data-testid={testId}
          className={cn(
            "h-auto min-h-(--density-control-sm) max-w-[14rem] gap-1.5 rounded-sm px-2 py-0 text-xs font-normal text-muted-foreground hover:bg-accent hover:text-foreground",
            value && "font-mono text-foreground",
            triggerClassName,
          )}
        >
          <Bot
            className={cn(
              "size-3.5 shrink-0",
              value ? "text-primary" : "text-muted-foreground",
            )}
            aria-hidden="true"
          />
          <span className="min-w-0 truncate">{displayedLabel}</span>
          {loading ? (
            <Spinner size="sm" variant="current" className="size-3 shrink-0" />
          ) : (
            <ChevronDown
              className="size-3 shrink-0 opacity-60"
              aria-hidden="true"
            />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        container={portalContainer}
        align="start"
        sideOffset={6}
        className={cn(
          "w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-border bg-popover p-0 text-popover-foreground shadow-lg",
          className,
        )}
      >
        <Command
          className="rounded-none border-0"
          value={value}
          onValueChange={() => {}}
        >
          <CommandInput
            placeholder={resolvedSearchPlaceholder}
            value={search}
            onValueChange={setSearch}
          />
          <CommandList className="max-h-60 overflow-y-auto overscroll-contain p-1">
            {normalizedOptions.length === 0 && !showCustomOption ? (
              <CommandEmpty>{resolvedEmptyMessage}</CommandEmpty>
            ) : null}

            {showCustomOption ? (
              <CommandGroup>
                <CommandItem
                  value={`__custom__:${trimmedSearch}`}
                  keywords={[trimmedSearch, customLabel]}
                  onSelect={() => {
                    onChange(trimmedSearch)
                    setOpen(false)
                    setSearch("")
                  }}
                  className="cursor-pointer gap-2 font-medium text-primary"
                >
                  <Plus className="size-3.5 shrink-0 text-primary" />
                  <span className="truncate">{customLabel}</span>
                </CommandItem>
              </CommandGroup>
            ) : null}

            {groups ? (
              Array.from(groups.entries()).map(([groupName, groupOptions]) => (
                <CommandGroup key={groupName} heading={groupName || undefined}>
                  {groupOptions.map((option) => (
                    <CommandItem
                      key={option.value}
                      value={option.value}
                      disabled={option.disabled}
                      keywords={[option.label, option.value]}
                      onSelect={() => {
                        onChange(option.value)
                        setOpen(false)
                        setSearch("")
                      }}
                      className="flex cursor-pointer items-center justify-between"
                    >
                      <span className="truncate font-mono text-xs">
                        {option.label}
                      </span>
                      {value === option.value && (
                        <Check className="size-3.5 shrink-0 text-primary" />
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))
            ) : (
              <CommandGroup>
                {normalizedOptions.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    disabled={option.disabled}
                    keywords={[option.label, option.value]}
                    onSelect={() => {
                      onChange(option.value)
                      setOpen(false)
                      setSearch("")
                    }}
                    className="flex cursor-pointer items-center justify-between"
                  >
                    <span className="truncate font-mono text-xs">
                      {option.label}
                    </span>
                    {value === option.value && (
                      <Check className="size-3.5 shrink-0 text-primary" />
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
