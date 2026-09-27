import { Fingerprint } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"

import toast from "~/lib/notify"
import {
  getExtensionURL,
  getExtensionVersion,
  getManagementSelf,
  getRuntimeId,
} from "~/utils/browser/browserApi"
import { getDevIdentity } from "~/utils/browser/extensionIdentity"
import { formatDevInstanceLabel } from "~/utils/core/devBranding"
import { getRuntimeMode } from "~/utils/core/environment"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"

import type { DevPanelInfoRow, DevPanelSection } from "../types"

const logger = createLogger("DevInstanceIdentitySection")

/**
 * Identity of the running development build: which directory it was built from,
 * which directory the browser loaded, and which toolbar icon it owns.
 *
 * Rows are ordered by usefulness and labelled with where each value comes from,
 * because only the source path is a baked fact; the rest are runtime reads or
 * derived names.
 */
export function useInstanceIdentityDevSection(): DevPanelSection {
  const [installType, setInstallType] = useState<string | null>(null)
  const [isCopying, setIsCopying] = useState(false)

  useEffect(() => {
    let cancelled = false

    void getManagementSelf()
      .then((info) => {
        if (!cancelled) setInstallType(info?.installType ?? null)
      })
      .catch((error) => {
        logger.debug("Failed to read install type", error)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const identity = getDevIdentity()
  const runtimeId = getRuntimeId() ?? null

  const handleCopyIdentity = useCallback(async () => {
    setIsCopying(true)
    try {
      const payload = {
        ...identity,
        runtimeId,
        installType,
        version: getExtensionVersion(),
        mode: getRuntimeMode(),
        baseUrl: getExtensionURL(""),
      }
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2))
      toast.success("Dev: copied this build's identity")
    } catch (error) {
      logger.error("Failed to copy dev identity", error)
      toast.error(getErrorMessage(error))
    } finally {
      setIsCopying(false)
    }
  }, [identity, installType, runtimeId])

  return useMemo(() => {
    const rows: DevPanelInfoRow[] = [
      {
        id: "source-path",
        label: "Source path",
        value: identity.path,
        tone: "stable",
        copyable: true,
        hint: identity.path
          ? undefined
          : identity.source === "runtime-id"
            ? "This build baked no path; the color falls back to the extension id."
            : "No build information available.",
      },
      {
        id: "output-path",
        label: "Build output",
        value: identity.outputPath,
        tone: "best-effort",
        copyable: true,
        hint: "Named from the project root at build time; the browser never reports it.",
      },
      {
        id: "extension-id",
        label: "Extension ID",
        value: runtimeId,
        tone: "runtime",
        copyable: true,
        hint: "Derived by the browser from the load path; not reversible to a path.",
      },
      {
        id: "badge-code",
        label: "Toolbar badge",
        value: identity.badgeText,
        tone: "stable",
        hint: "Same color and code appear on every surface of this instance.",
      },
      {
        id: "instance-color",
        label: "Instance color",
        value: identity.color,
        tone: "stable",
        hint: `Palette slot ${identity.colorIndex ?? "unavailable"}`,
      },
      {
        id: "install-type",
        label: "Install type",
        value: installType,
        tone: "best-effort",
        hint: "Reported by the management API when the browser exposes it.",
      },
      {
        id: "runtime",
        label: "Mode / browser",
        value: `${getRuntimeMode()} / ${identity.browserTarget ?? "unknown"}`,
        tone: "runtime",
      },
      {
        id: "version",
        label: "Manifest version",
        value: getExtensionVersion() || null,
        tone: "runtime",
      },
      {
        id: "built-at",
        label: "Identity baked at",
        value: identity.builtAt,
        tone: "stable",
        hint: "Timestamp of the build that baked this identity, not of the browser reload.",
      },
    ]

    return {
      id: "instance-identity",
      title: "This build",
      icon: Fingerprint,
      description:
        "Which directory's code is loaded here, and which icon it owns.",
      // Reference material rather than a control: it stays folded so the
      // actionable sections keep the top of the panel.
      collapsible: true,
      defaultCollapsed: true,
      summary: formatDevInstanceLabel(identity),
      rows,
      actions: [
        {
          id: "copy-identity",
          label: "Dev: Copy build identity JSON",
          loading: isCopying,
          disabled: isCopying,
          run: handleCopyIdentity,
        },
      ],
    }
  }, [handleCopyIdentity, identity, installType, isCopying, runtimeId])
}
