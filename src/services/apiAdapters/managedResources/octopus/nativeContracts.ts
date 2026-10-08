import { type CredentialListPatch } from "~/services/apiAdapters/managedResources/shared/credentialListEditor"
import { type OctopusUpdateChannelInput } from "~/types/octopus"

export type UpdateCommand = Omit<OctopusUpdateChannelInput, "id" | "source"> & {
  credentialPatch?: CredentialListPatch
}
