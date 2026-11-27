import { useState } from "react"

import { AccountSiteIcon } from "~/components/icons/productIcons"
import { CHROMIUM_FAVICON_PERMISSION } from "~/constants/extensionPermissions"
import { sanitizeTabFaviconUrl } from "~/utils/browser/recentTabSites"
import { getExtensionURL, getManifest } from "~/utils/browser/runtime"

const iconClassName = "size-4 shrink-0"
const CHROMIUM_FAVICON_SIZE = "32"

/** Resolves the cache endpoint only in a Chromium MV3 runtime with access. */
function getChromiumFaviconUrl(pageUrl: string): string | undefined {
  try {
    const url = new URL(getExtensionURL("/_favicon/"))
    if (url.protocol !== "chrome-extension:") return
    const manifest = getManifest()
    if (
      manifest.manifest_version !== 3 ||
      !manifest.permissions?.includes(CHROMIUM_FAVICON_PERMISSION)
    )
      return
    url.searchParams.set("pageUrl", pageUrl)
    url.searchParams.set("size", CHROMIUM_FAVICON_SIZE)
    return url.href
  } catch {
    // Extension APIs can be absent in previews or invalidated by a reload.
    return undefined
  }
}

/** Renders a decorative site icon with local browser data preferred. */
export function SiteFavicon({
  pageUrl,
  favIconUrl,
}: {
  pageUrl: string
  favIconUrl?: string
}) {
  const sources = [
    getChromiumFaviconUrl(pageUrl),
    sanitizeTabFaviconUrl(favIconUrl),
  ].filter((source): source is string => Boolean(source))

  return <FaviconImage key={JSON.stringify(sources)} sources={sources} />
}

/** Tries each available image once before showing the default site icon. */
function FaviconImage({ sources }: { sources: string[] }) {
  const [index, setIndex] = useState(0)
  const src = sources[index]

  if (!src) {
    return <AccountSiteIcon aria-hidden="true" className={iconClassName} />
  }

  return (
    <img
      key={src}
      src={src}
      alt=""
      aria-hidden="true"
      referrerPolicy="no-referrer"
      className={`${iconClassName} rounded-xs object-contain`}
      onError={() => setIndex(index + 1)}
    />
  )
}
