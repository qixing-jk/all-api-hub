import type { ApiServiceRequest } from "~/services/apiTransport/type"

export type AccountServiceCredential = {
  kind: "singleton_service_key"
  service: string
  label: string
  key: string
  isAuthenticated: boolean
  baseUrl?: string
}

export type ServiceCredentialCapability = {
  fetch(request: ApiServiceRequest): Promise<AccountServiceCredential>
  rotate?(request: ApiServiceRequest): Promise<AccountServiceCredential>
}
