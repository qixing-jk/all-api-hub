import type { TFunction } from "i18next"
import { ArrowDown, ArrowUp } from "lucide-react"

import { IconButton } from "~/components/ui"
import { RepeatableInput } from "~/components/ui/RepeatableInput"
import type { ResourceFieldOption } from "~/services/apiAdapters/contracts/resourceNative"

/** Edits route priority and membership while retaining labels for removed options. */
export function OrderedResourceSelection({
  t,
  selectedValues,
  optionsByValue,
  disabled,
  onChange,
}: {
  t: TFunction
  selectedValues: readonly string[]
  optionsByValue: ReadonlyMap<string, ResourceFieldOption>
  disabled: boolean
  onChange: (values: string[]) => void
}) {
  return (
    <div className="mt-density-2">
      <RepeatableInput
        items={selectedValues.map((id) => ({ id }))}
        onChange={(items) => onChange(items.map((item) => item.id))}
        isDragDisabled={disabled}
        isDeleteDisabled={() => disabled}
        renderItem={({ item, index }) => {
          const option = optionsByValue.get(item.id)
          const name = option?.displayLabel ?? item.id
          const move = (offset: -1 | 1) => {
            const next = [...selectedValues]
            ;[next[index], next[index + offset]] = [
              next[index + offset]!,
              next[index]!,
            ]
            onChange(next)
          }
          return (
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <span className="text-muted-foreground text-xs">{index + 1}</span>
              <span className="min-w-0 flex-1 truncate text-sm">{name}</span>
              {option?.secondaryLabel && (
                <span className="text-muted-foreground text-xs">
                  {option.secondaryLabel}
                </span>
              )}
              <IconButton
                type="button"
                size="sm"
                variant="ghost"
                aria-label={`${t("common:actions.moveUp")} ${name}`}
                disabled={disabled || index === 0}
                onClick={() => move(-1)}
              >
                <ArrowUp className="h-4 w-4" />
              </IconButton>
              <IconButton
                type="button"
                size="sm"
                variant="ghost"
                aria-label={`${t("common:actions.moveDown")} ${name}`}
                disabled={disabled || index === selectedValues.length - 1}
                onClick={() => move(1)}
              >
                <ArrowDown className="h-4 w-4" />
              </IconButton>
            </div>
          )
        }}
      />
    </div>
  )
}
