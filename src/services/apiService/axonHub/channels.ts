import { AXON_HUB_GRAPHQL_ERROR_CODES } from "~/constants/axonHub"
import {
  invalidateDetailSchemaCapabilityCache,
  isAdvancedDetailUnsupported,
  isAuthoritativeAxonHubChannel,
  isAxonHubChannelCoreDetail,
  isAxonHubChannelMutationProjection,
  isNonEmptyString,
  markAdvancedDetailUnsupported,
  markIncompleteAdvancedDetail,
  toSafeAxonHubChannelSummary,
} from "~/services/apiService/axonHub/channelProjection"
import { graphqlRequest } from "~/services/apiService/axonHub/graphqlClient"
import {
  AxonHubRequestError,
  isRecord,
} from "~/services/apiService/axonHub/graphqlProtocol"
import type {
  AxonHubChannel,
  AxonHubCreateChannelInput,
  AxonHubUpdateChannelInput,
} from "~/types/axonHub"
import type { AxonHubConfig } from "~/types/axonHubConfig"
import { normalizeList } from "~/utils/core/string"

// Keep channel-list reads limited to non-secret summary fields and sanitize
// over-returned nodes before exposing native resource summaries.
const AXON_HUB_CHANNEL_LIST_SELECTION = `
  id
  type
  baseURL
  name
  status
  tags
  supportedModels
  manualModels
`

// This is the minimum detail contract required by AxonHub editing and
// credential handling. Optional advanced aggregates are queried separately so
// their schema drift can safely fall back without disabling core management.
const AXON_HUB_CHANNEL_CORE_DETAIL_SELECTION = `
  __typename
  id
  createdAt
  updatedAt
  type
  baseURL
  name
  status
  credentials {
    apiKey
    apiKeys
  }
  supportedModels
  autoSyncSupportedModels
  autoSyncModelPattern
  manualModels
  tags
  defaultTestModel
  orderingWeight
  errorMessage
  remark
`

// Keep detail reads aligned with product-owned display, edit-safety, and
// migration facts. In particular, do not round-trip ChannelSettings: AxonHub
// replaces that aggregate and beta9 already added members unknown to older
// clients. Sources: https://github.com/looplj/axonhub/blob/v1.0.0-beta8/internal/server/biz/channel.go
// and https://github.com/looplj/axonhub/blob/v1.0.0-beta9/internal/server/gql/axonhub.graphql
const AXON_HUB_CHANNEL_DETAIL_SELECTION = `
  __typename
  id
  createdAt
  updatedAt
  type
  baseURL
  name
  status
  policies {
    stream
  }
  credentials {
    apiKey
    apiKeys
    gcp {
      region
      projectID
      jsonData
    }
    oauth {
      accessToken
      refreshToken
      clientID
      expiresAt
      tokenType
      scopes
    }
  }
  supportedModels
  autoSyncSupportedModels
  autoSyncModelPattern
  manualModels
  tags
  defaultTestModel
  settings {
    extraModelPrefix
    modelMappings {
      from
      to
    }
  }
  orderingWeight
  errorMessage
  remark
  endpoints {
    apiFormat
    path
    baseURL
    transport
  }
`

// Mutation responses are receipts, not detail reads. Keeping this projection
// narrow prevents unrelated Channel fields from making every write invalid.
const AXON_HUB_CHANNEL_MUTATION_SELECTION = `
  __typename
  id
  type
  baseURL
  name
  status
`

const LIST_AXON_HUB_CHANNEL_PAGE = `
  query ListAxonHubChannelPage($input: QueryChannelInput!) {
    queryChannels(input: $input) {
      edges {
        node {
          ${AXON_HUB_CHANNEL_LIST_SELECTION}
        }
        cursor
      }
      pageInfo {
        hasNextPage
        endCursor
      }
      totalCount
    }
  }
`

const GET_AXON_HUB_CHANNEL = `
  query GetAxonHubChannel($id: ID!) {
    node(id: $id) {
      ... on Channel {
        ${AXON_HUB_CHANNEL_DETAIL_SELECTION}
      }
    }
  }
`

const GET_AXON_HUB_CHANNEL_CORE = `
  query GetAxonHubChannelCore($id: ID!) {
    node(id: $id) {
      ... on Channel {
        ${AXON_HUB_CHANNEL_CORE_DETAIL_SELECTION}
      }
    }
  }
`

const CREATE_CHANNEL = `
  mutation CreateChannel($input: CreateChannelInput!) {
    createChannel(input: $input) {
      ${AXON_HUB_CHANNEL_MUTATION_SELECTION}
    }
  }
`

const UPDATE_CHANNEL = `
  mutation UpdateChannel($id: ID!, $input: UpdateChannelInput!) {
    updateChannel(id: $id, input: $input) {
      ${AXON_HUB_CHANNEL_MUTATION_SELECTION}
    }
  }
`

const UPDATE_CHANNEL_STATUS = `
  mutation UpdateChannelStatus($id: ID!, $status: ChannelStatus!) {
    updateChannelStatus(id: $id, status: $status) {
      __typename
      id
      status
    }
  }
`

const DELETE_CHANNEL = `
  mutation DeleteChannel($id: ID!) {
    deleteChannel(id: $id)
  }
`

export type AxonHubChannelPage = {
  items: AxonHubChannel[]
  total?: number
  nextCursor?: string
}

type AxonHubChannelStatusResult = Pick<AxonHubChannel, "id" | "status">

const requestAxonHubChannelPage = async (
  config: AxonHubConfig,
  input: { cursor?: string; limit: number },
  query: string,
  options?: Pick<RequestInit, "signal">,
): Promise<AxonHubChannelPage> => {
  const data = await graphqlRequest<unknown>(
    config,
    query,
    {
      input: {
        first: input.limit,
        ...(input.cursor ? { after: input.cursor } : {}),
      },
    },
    options,
  )

  if (!isRecord(data) || !isRecord(data.queryChannels)) {
    throw new AxonHubRequestError("protocol", "not-dispatched")
  }
  const connection = data.queryChannels
  if (!Array.isArray(connection.edges) || !isRecord(connection.pageInfo)) {
    throw new AxonHubRequestError("protocol", "not-dispatched")
  }
  if (
    typeof connection.pageInfo.hasNextPage !== "boolean" ||
    (connection.pageInfo.endCursor !== null &&
      typeof connection.pageInfo.endCursor !== "string") ||
    (connection.pageInfo.hasNextPage &&
      !isNonEmptyString(connection.pageInfo.endCursor)) ||
    (connection.totalCount !== undefined &&
      (typeof connection.totalCount !== "number" ||
        !Number.isInteger(connection.totalCount) ||
        connection.totalCount < 0))
  ) {
    throw new AxonHubRequestError("protocol", "not-dispatched")
  }

  const items: AxonHubChannel[] = []
  for (const edge of connection.edges) {
    if (
      !isRecord(edge) ||
      (edge.cursor !== undefined &&
        edge.cursor !== null &&
        typeof edge.cursor !== "string")
    ) {
      throw new AxonHubRequestError("protocol", "not-dispatched")
    }
    const channel = toSafeAxonHubChannelSummary(edge.node)
    if (!channel) {
      throw new AxonHubRequestError("protocol", "not-dispatched")
    }
    items.push(channel)
  }

  const nextCursor = connection.pageInfo.hasNextPage
    ? (connection.pageInfo.endCursor as string)
    : undefined

  return {
    items,
    ...(typeof connection.totalCount === "number"
      ? { total: connection.totalCount }
      : {}),
    ...(nextCursor ? { nextCursor } : {}),
  }
}

/**
 * Return exactly one native AxonHub cursor page.
 */
export async function listAxonHubChannelPage(
  config: AxonHubConfig,
  input: { cursor?: string; limit: number },
  options?: Pick<RequestInit, "signal">,
): Promise<AxonHubChannelPage> {
  return requestAxonHubChannelPage(
    config,
    input,
    LIST_AXON_HUB_CHANNEL_PAGE,
    options,
  )
}

const isAxonHubSchemaValidationError = (error: unknown) =>
  error instanceof AxonHubRequestError &&
  error.code === AXON_HUB_GRAPHQL_ERROR_CODES.VALIDATION_FAILED

const requestAxonHubChannelNode = async (
  config: AxonHubConfig,
  id: string,
  query: string,
  options?: Pick<RequestInit, "signal">,
) => {
  const data = await graphqlRequest<unknown>(config, query, { id }, options)
  if (!isRecord(data) || !("node" in data)) {
    throw new AxonHubRequestError("protocol", "not-dispatched")
  }
  if (data.node === null) {
    throw new AxonHubRequestError("not-found", "not-dispatched")
  }
  return data.node
}

/**
 * Load one native AxonHub channel by its opaque GraphQL id.
 */
export async function getAxonHubChannel(
  config: AxonHubConfig,
  id: string,
  options?: Pick<RequestInit, "signal">,
): Promise<AxonHubChannel> {
  let complete = !isAdvancedDetailUnsupported(config)
  let node: unknown
  try {
    node = await requestAxonHubChannelNode(
      config,
      id,
      complete ? GET_AXON_HUB_CHANNEL : GET_AXON_HUB_CHANNEL_CORE,
      options,
    )
  } catch (error) {
    if (!complete || !isAxonHubSchemaValidationError(error)) throw error
    complete = false
    markAdvancedDetailUnsupported(config)
    node = await requestAxonHubChannelNode(
      config,
      id,
      GET_AXON_HUB_CHANNEL_CORE,
      options,
    )
  }

  if (complete) {
    if (!isAuthoritativeAxonHubChannel(node) || node.id !== id) {
      throw new AxonHubRequestError("protocol", "not-dispatched")
    }
    invalidateDetailSchemaCapabilityCache(config)
    return node
  }

  if (!isAxonHubChannelCoreDetail(node) || node.id !== id) {
    throw new AxonHubRequestError("protocol", "not-dispatched")
  }

  markIncompleteAdvancedDetail(node)
  return node
}

/** Resolve matching credentials without requesting optional advanced editor fields. */
export async function getAxonHubChannelSecretKey(
  config: AxonHubConfig,
  id: string,
  options?: Pick<RequestInit, "signal">,
): Promise<string> {
  const node = await requestAxonHubChannelNode(
    config,
    id,
    GET_AXON_HUB_CHANNEL_CORE,
    options,
  )
  if (!isAxonHubChannelCoreDetail(node) || node.id !== id) {
    throw new AxonHubRequestError("protocol", "not-dispatched")
  }
  return normalizeList([
    ...(node.credentials?.apiKeys ?? []),
    node.credentials?.apiKey ?? "",
  ]).join("\n")
}

/**
 * Create a channel through AxonHub admin GraphQL.
 */
export async function createAxonHubChannel(
  config: AxonHubConfig,
  input: AxonHubCreateChannelInput,
  options?: Pick<RequestInit, "signal">,
) {
  const data = await graphqlRequest<unknown>(
    config,
    CREATE_CHANNEL,
    { input },
    options,
  )
  if (
    !isRecord(data) ||
    !isAxonHubChannelMutationProjection(data.createChannel)
  ) {
    throw new AxonHubRequestError("protocol", "dispatched")
  }
  return data.createChannel
}

/**
 * Update a channel through AxonHub admin GraphQL.
 */
export async function updateAxonHubChannel(
  config: AxonHubConfig,
  id: string,
  input: AxonHubUpdateChannelInput,
  options?: Pick<RequestInit, "signal">,
) {
  // This transport forwards UpdateChannelInput unchanged. Product adapters
  // must account for AxonHub's custom updater semantics instead of assuming
  // every generated append/clear field is implemented. Source:
  // https://github.com/looplj/axonhub/blob/v1.0.0-beta9/internal/server/biz/channel.go
  const data = await graphqlRequest<unknown>(
    config,
    UPDATE_CHANNEL,
    { id, input },
    options,
  )
  if (
    !isRecord(data) ||
    !isAxonHubChannelMutationProjection(data.updateChannel) ||
    data.updateChannel.id !== id
  ) {
    throw new AxonHubRequestError("protocol", "dispatched")
  }
  return data.updateChannel
}

/**
 * Update an AxonHub channel status independently from editable fields.
 */
export async function updateAxonHubChannelStatus(
  config: AxonHubConfig,
  id: string,
  status: string,
  options?: Pick<RequestInit, "signal">,
) {
  const data = await graphqlRequest<unknown>(
    config,
    UPDATE_CHANNEL_STATUS,
    { id, status },
    options,
  )
  if (
    !isRecord(data) ||
    !isRecord(data.updateChannelStatus) ||
    data.updateChannelStatus.__typename !== "Channel" ||
    data.updateChannelStatus.id !== id ||
    data.updateChannelStatus.status !== status
  ) {
    throw new AxonHubRequestError("protocol", "dispatched")
  }
  return { id, status } as AxonHubChannelStatusResult
}

/**
 * Delete an AxonHub channel by GraphQL id.
 */
export async function deleteAxonHubChannel(
  config: AxonHubConfig,
  id: string,
  options?: Pick<RequestInit, "signal">,
) {
  const data = await graphqlRequest<unknown>(
    config,
    DELETE_CHANNEL,
    { id },
    options,
  )
  if (!isRecord(data) || typeof data.deleteChannel !== "boolean") {
    throw new AxonHubRequestError("protocol", "dispatched")
  }
  return data.deleteChannel
}
