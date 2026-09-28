/** New API session-cookie verification options, not a requirement on other login protocols. */
export interface NewApiAccountLoginProtocolConfig {
  userIdHeader: string
  completionPaths: readonly `/${string}`[]
}
