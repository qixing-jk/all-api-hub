import ModelRedirectSettings from "./ModelRedirectSettings"
import NewApiModelSyncSettings from "./NewApiModelSyncSettings"
import NewApiSettings from "./NewApiSettings"

export default function NewApiTab() {
  return (
    <div className="space-y-6">
      <section id="new-api">
        <NewApiSettings />
      </section>

      <section id="new-api-model-sync">
        <NewApiModelSyncSettings />
      </section>

      <section id="model-redirect">
        <ModelRedirectSettings />
      </section>
    </div>
  )
}
