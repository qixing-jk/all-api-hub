/** Owns acceptance of async runs, key-input callbacks and cancellable key creation. */
export class AccountPostSaveSession {
  private autoConfigGeneration = 0
  private provisioningGeneration = 0
  private nextInputSession = 0
  private inputSession: number | null = null
  private creation: AbortController | null = null

  get autoConfigRun() {
    return this.autoConfigGeneration
  }
  get provisioningRun() {
    return this.provisioningGeneration
  }
  get keyInputSession() {
    return this.inputSession
  }

  invalidateAutoConfig() {
    this.autoConfigGeneration += 1
  }
  invalidateProvisioning() {
    this.provisioningGeneration += 1
  }
  beginAutoConfig() {
    this.invalidateAutoConfig()
    return this.autoConfigGeneration
  }
  beginProvisioning() {
    this.invalidateProvisioning()
    return this.provisioningGeneration
  }
  acceptsAutoConfig(run: number) {
    return run === this.autoConfigGeneration
  }
  acceptsProvisioning(run: number) {
    return run === this.provisioningGeneration
  }

  openKeyInput() {
    this.inputSession = ++this.nextInputSession
    return this.inputSession
  }
  invalidateKeyInput() {
    this.inputSession = null
  }
  acceptsKeyInput(session: number | null) {
    return session !== null && session === this.inputSession
  }
  beginCreation() {
    this.creation?.abort()
    this.creation = new AbortController()
    return this.creation.signal
  }
  clear() {
    this.invalidateAutoConfig()
    this.invalidateProvisioning()
    this.invalidateKeyInput()
    this.creation?.abort()
    this.creation = null
  }
}
