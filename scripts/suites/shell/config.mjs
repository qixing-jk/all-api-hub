import {
  APIYI_HOSTNAME,
  LAOZHANG_HOSTNAMES,
  SITE_TYPES,
} from "../../../src/services/accountSiteDefinitions/identifiers.ts"

/** Local credentials are only supplied to native login or normal token fields. */
export function readShellLiveConfig(selection, env = process.env) {
  const sites = [
    {
      id: SITE_TYPES.APIYI,
      hostnames: [APIYI_HOSTNAME],
      defaultHost: APIYI_HOSTNAME,
    },
    {
      id: SITE_TYPES.LAOZHANG,
      hostnames: LAOZHANG_HOSTNAMES,
      defaultHost: "api2.laozhang.ai",
    },
  ]
  if (selection !== "all" && !sites.some(({ id }) => id === selection))
    throw new Error("Unknown Shell live site")
  return sites
    .filter(({ id }) => selection === "all" || selection === id)
    .map(({ id, defaultHost, hostnames }) => {
      const prefix = id.toUpperCase()
      let url
      try {
        url = new URL(env[`${prefix}_BASE_URL`] || `https://${defaultHost}`)
        if (
          url.protocol !== "https:" ||
          !hostnames.includes(url.hostname) ||
          url.port ||
          url.username ||
          url.password ||
          url.pathname !== "/" ||
          url.search ||
          url.hash
        )
          throw new Error()
      } catch {
        throw new Error(`${prefix}_BASE_URL must be an official console origin`)
      }
      return {
        id,
        origin: url.origin,
        username: env[`${prefix}_USERNAME`] || "",
        password: env[`${prefix}_PASSWORD`] || "",
        accessToken: env[`${prefix}_ACCESS_TOKEN`] || "",
        expectedUserId: env[`${prefix}_USER_ID`] || "",
      }
    })
}
