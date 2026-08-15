import { TriangleAlert } from "lucide-react"

interface WarningToastIconProps {
  resolvedTheme?: string
}

/**
 * Shared warning icon used by both the custom warning toast and its runtime
 * fallback path so warning feedback keeps one visual source of truth.
 */
export function WarningToastIcon({ resolvedTheme }: WarningToastIconProps) {
  return (
    <div className="flex min-w-5 items-center justify-center">
      <TriangleAlert
        className={
          resolvedTheme === "dark"
            ? "h-5 w-5 text-amber-400"
            : "h-5 w-5 text-amber-500"
        }
      />
    </div>
  )
}
