import cliProxyApiLogo from "~/assets/cli-proxy-api-logo.png"
import {
  ICON_SIZE_CLASSNAME,
  type IconSize,
} from "~/components/icons/iconSizes"
import { cn } from "~/lib/utils"

interface CliProxyApiIconProps {
  size?: IconSize
}

/** Render the CLIProxyAPI logo at the shared icon size. */
export function CliProxyApiIcon({ size = "sm" }: CliProxyApiIconProps) {
  return (
    <img
      src={cliProxyApiLogo}
      alt="CLIProxyAPI logo"
      className={cn(ICON_SIZE_CLASSNAME[size])}
      loading="lazy"
      decoding="async"
    />
  )
}
