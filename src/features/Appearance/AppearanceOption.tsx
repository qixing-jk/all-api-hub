import { Check } from "lucide-react"
import type { ReactNode } from "react"

/** A visual choice with native radio navigation and a separate, readable label. */
export function AppearanceOption({
  name,
  value,
  label,
  checked,
  onSelect,
  children,
  description,
}: {
  name: string
  value: string
  label: string
  checked: boolean
  onSelect: () => void
  children: ReactNode
  description?: string
}) {
  return (
    <label className="relative min-w-0 cursor-pointer">
      <input
        className="peer sr-only"
        type="radio"
        name={name}
        value={value}
        aria-label={label}
        checked={checked}
        onChange={onSelect}
      />
      <span className="border-border peer-checked:border-primary peer-checked:ring-primary peer-focus-visible:ring-ring flex h-full min-w-0 flex-col rounded-md border py-2 peer-checked:ring-1 peer-focus-visible:ring-2">
        <span
          aria-hidden="true"
          className="bg-muted/40 mx-2 flex h-16 min-w-0 items-center justify-center overflow-hidden rounded-sm"
        >
          {children}
        </span>
        <span className="mt-2 block px-0.5 text-center text-xs wrap-anywhere">
          {label}
        </span>
        {description && (
          <span className="text-muted-foreground mt-1 block px-2 text-xs leading-relaxed">
            {description}
          </span>
        )}
      </span>
      <span
        aria-hidden="true"
        className="bg-primary text-primary-foreground pointer-events-none absolute top-1 right-1 hidden size-4 items-center justify-center rounded-full peer-checked:flex"
      >
        <Check className="size-3" strokeWidth={3} />
      </span>
    </label>
  )
}
