import { resolveStaticAccountRoutePath } from "~/services/apiAdapters/accountRoutes"
import {
  ACCOUNT_BOOTSTRAP_ROUTE_KINDS,
  type AccountBootstrapCapability,
  type AccountBootstrapRouteKind,
  type AccountBootstrapRouteTarget,
} from "~/services/apiAdapters/contracts/accountBootstrap"
import { getNewApiVariantRegistration } from "~/services/apiAdapters/newApi/variantRegistration"

export { clearSiteRouteFactsCacheForTests } from "~/services/apiAdapters/newApi/variantOperations/routes"
/** Keeps unsupported and static routes separate from registered deployment probes. */
export async function resolveNewApiAccountRoutePath(
  target: AccountBootstrapRouteTarget,
  route: AccountBootstrapRouteKind,
  accountBootstrap: Pick<AccountBootstrapCapability, "loadBootstrapFacts">,
): Promise<string | null> {
  const staticPath = resolveStaticAccountRoutePath(target, route)
  if (
    staticPath === null ||
    route === ACCOUNT_BOOTSTRAP_ROUTE_KINDS.SiteAnnouncements
  )
    return staticPath
  const resolveDynamic = getNewApiVariantRegistration(
    target.siteType,
  ).resolveRoutePath
  return resolveDynamic
    ? resolveDynamic(target, route, accountBootstrap, staticPath)
    : staticPath
}
