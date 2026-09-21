import { getDevIdentity } from "~/utils/browser/extensionIdentity"
import { formatDevInstanceLabel } from "~/utils/core/devBranding"

/**
 * Dev-only marker for extension UI injected into a web page.
 *
 * It renders inside the content UI root, so it exists exactly while the
 * extension is showing something on the page, and it stays out of the way:
 * pointer events pass through, and the full source path is exposed through the
 * native title attribute rather than the app tooltip, which does not survive an
 * arbitrary page's shadow root.
 */
export function DevIdentityTag() {
  const identity = getDevIdentity()

  if (!identity.color) return null

  return (
    <div
      data-testid="dev-identity-tag"
      title={identity.path ?? "This build baked no source path"}
      className="bg-card/90 border-border text-foreground pointer-events-none fixed bottom-2 left-2 inline-flex max-w-[70vw] items-center gap-x-1.5 rounded-full border px-1.5 py-0.5 text-xs shadow-sm"
    >
      <span
        aria-hidden="true"
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: identity.color }}
      />
      <span className="truncate font-mono">
        {formatDevInstanceLabel(identity)}
      </span>
    </div>
  )
}
