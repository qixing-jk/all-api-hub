import {
  OCTOPUS_COOKIE_API_VERSIONS,
  type OctopusAuthSession,
} from "~/services/apiService/octopus/auth"
import { fetchOctopusCookieApi } from "~/services/apiService/octopus/cookieTransport"
import { currentOctopusContract } from "~/services/apiService/octopus/current"
import {
  OCTOPUS_API_OPERATIONS,
  type OctopusApiOperation,
} from "~/services/apiService/octopus/operations"
import { getOctopusEnvelopeData } from "~/services/apiService/octopus/responseProtocol"
import { octopusV013Contract } from "~/services/apiService/octopus/v013"
import { ApiError } from "~/services/apiTransport/errors"
import { type ProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import { type OctopusChannel } from "~/types/octopus"
import type { OctopusConfig } from "~/types/octopusConfig"
import { type OctopusApiResourceBinding } from "~/types/tempWindowFetch"

export const fetchOctopusV013Channels = async (params: {
  config: OctopusConfig
  session: Extract<OctopusAuthSession, { mode: "cookie" }>
  baseUrl: string
  signal?: AbortSignal
  protectionBypassExecution?: ProtectionBypassExecution
  resourceBinding?: OctopusApiResourceBinding
}): Promise<OctopusChannel[]> => {
  const request = async (endpoint: string) => {
    const remote = await fetchOctopusCookieApi({
      config: params.config,
      session: params.session,
      baseUrl: params.baseUrl,
      endpoint,
      fetchOptions: params.signal ? { signal: params.signal } : {},
      protectionBypassExecution: params.protectionBypassExecution,
      resourceBinding: params.resourceBinding,
    })
    if (!remote.success) {
      throw new Error(
        remote.status
          ? "HTTP " +
            remote.status +
            ": " +
            (remote.error || "Octopus request failed")
          : remote.error || "Octopus request failed",
      )
    }
    return getOctopusEnvelopeData(endpoint, remote.data)
  }

  return octopusV013Contract
    .parseStatsList(await request(octopusV013Contract.statsEndpoint))
    .map(octopusV013Contract.normalizeStatsChannel)
}

export const fetchOctopusV013ChannelDetail = async (params: {
  config: OctopusConfig
  session: Extract<OctopusAuthSession, { mode: "cookie" }>
  baseUrl: string
  channelId: number
  signal?: AbortSignal
  protectionBypassExecution?: ProtectionBypassExecution
  resourceBinding?: OctopusApiResourceBinding
}): Promise<OctopusChannel> => {
  const endpoint = octopusV013Contract.detailEndpoint(params.channelId)
  const remote = await fetchOctopusCookieApi({
    config: params.config,
    session: params.session,
    baseUrl: params.baseUrl,
    endpoint,
    fetchOptions: params.signal ? { signal: params.signal } : {},
    protectionBypassExecution: params.protectionBypassExecution,
    resourceBinding: params.resourceBinding,
  })
  if (!remote.success) {
    // Preserve HTTP identity so native consumers can distinguish absence from failed reads.
    throw new ApiError(
      remote.status
        ? "HTTP " +
          remote.status +
          ": " +
          (remote.error || "Octopus request failed")
        : remote.error || "Octopus request failed",
      remote.status,
      endpoint,
    )
  }
  return octopusV013Contract.normalizeChannel(
    getOctopusEnvelopeData(endpoint, remote.data),
  )
}

export const resolveOctopusCookieApiVersion = async (params: {
  config: OctopusConfig
  session: Extract<OctopusAuthSession, { mode: "cookie" }>
  baseUrl: string
  signal?: AbortSignal
  protectionBypassExecution?: ProtectionBypassExecution
  resourceBinding?: OctopusApiResourceBinding
}) => {
  if (params.session.apiVersion) return params.session.apiVersion

  const probeOperation: OctopusApiOperation = {
    kind: OCTOPUS_API_OPERATIONS.ListChannels,
  }
  const probeRequest = currentOctopusContract.createRequest(
    probeOperation,
    params.signal ? { signal: params.signal } : {},
  )
  const probe = await fetchOctopusCookieApi({
    config: params.config,
    session: params.session,
    baseUrl: params.baseUrl,
    endpoint: probeRequest.endpoint,
    fetchOptions: probeRequest.init,
    protectionBypassExecution: params.protectionBypassExecution,
    resourceBinding: params.resourceBinding,
  })

  if (probe.success) {
    currentOctopusContract.normalizeResponse(
      probeOperation,
      getOctopusEnvelopeData(probeRequest.endpoint, probe.data),
    )
    params.session.apiVersion = OCTOPUS_COOKIE_API_VERSIONS.V012
    params.session.confirmed = true
    return params.session.apiVersion
  }

  if (probe.status !== 404) {
    throw new Error(
      probe.status
        ? "HTTP " +
          probe.status +
          ": " +
          (probe.error || "Octopus session confirmation failed")
        : probe.error || "Octopus session confirmation failed",
    )
  }

  const statsEndpoint = octopusV013Contract.statsEndpoint
  const statsProbe = await fetchOctopusCookieApi({
    config: params.config,
    session: params.session,
    baseUrl: params.baseUrl,
    endpoint: statsEndpoint,
    fetchOptions: params.signal ? { signal: params.signal } : {},
    protectionBypassExecution: params.protectionBypassExecution,
    resourceBinding: params.resourceBinding,
  })
  if (!statsProbe.success) {
    throw new Error(
      statsProbe.status
        ? "HTTP " +
          statsProbe.status +
          ": " +
          (statsProbe.error || "Octopus session confirmation failed")
        : statsProbe.error || "Octopus session confirmation failed",
    )
  }
  octopusV013Contract.parseStatsList(
    getOctopusEnvelopeData(statsEndpoint, statsProbe.data),
  )
  params.session.apiVersion = OCTOPUS_COOKIE_API_VERSIONS.V013
  params.session.confirmed = true
  return params.session.apiVersion
}
