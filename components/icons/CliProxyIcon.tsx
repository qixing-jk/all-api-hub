import cliProxyLogo from "~/assets/cli-proxy-api-logo.png"
import {
  ICON_SIZE_CLASSNAME,
  type IconSize,
} from "~/components/icons/iconSizes"
import { cn } from "~/lib/utils"

interface CliProxyIconProps {
  size?: IconSize
}

/**
 * CliProxyIcon renders the CLI Proxy API logo at a chosen size.
 */
export function CliProxyIcon({ size = "sm" }: CliProxyIconProps) {
  return (
    <img
      src={cliProxyLogo}
      alt="CLIProxyAPI logo"
      className={cn(ICON_SIZE_CLASSNAME[size])}
      loading="lazy"
      decoding="async"
    />
  )
}
