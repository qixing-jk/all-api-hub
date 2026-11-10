import i18next from "i18next"
import React from "react"
import { createRoot } from "react-dom/client"
import { initReactI18next } from "react-i18next"

import { Alert, AlertAction } from "~/components/ui/Alert"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/Card"
import { Checkbox } from "~/components/ui/checkbox"
import {
  Combobox,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "~/components/ui/combobox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import { FormField } from "~/components/ui/FormField"
import { Input } from "~/components/ui/input"
import { Switch } from "~/components/ui/Switch"
import { Table, TableBody, TableCell, TableRow } from "~/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs"
import { Textarea } from "~/components/ui/Textarea"
import ChannelFilterDialog from "~/features/ManagedSiteChannels/filters/ChannelFilterDialog"
import { createManagedUpstreamResourceRef } from "~/types/managedUpstreamResource"

import "~/styles/style.css"

await i18next
  .use(initReactI18next)
  .init({ lng: "en", resources: { en: { translation: {} } } })

/** Render real shared components with the application's stylesheet. */
function Fixtures() {
  const [enabled, setEnabled] = React.useState(false)
  const [rulesOpen, setRulesOpen] = React.useState(false)
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 p-6">
      <h1 className="text-xl">Shared controls</h1>
      <Button onClick={() => setRulesOpen(true)}>Edit channel rules</Button>
      <ChannelFilterDialog
        channel={fixtureChannel}
        open={rulesOpen}
        onClose={() => setRulesOpen(false)}
      />
      <section aria-label="Compositions" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>
              Repair results with a longer localized heading
            </CardTitle>
            <CardDescription>
              Search the keys that need attention.
            </CardDescription>
            <CardAction className="w-full sm:w-48">
              <Input aria-label="Search keys" />
            </CardAction>
          </CardHeader>
        </Card>
        <Alert
          description="Read the setup guide before enabling automatic synchronization."
          action={
            <AlertAction>
              <Button size="sm">Open the getting started guide</Button>
            </AlertAction>
          }
        />
        <FormField
          label="Exchange rate"
          description="Enter the CNY value of one US dollar."
          error="Enter a positive number."
          orientation="responsive"
        >
          {(control) => <Input {...control} type="number" defaultValue="-1" />}
        </FormField>
        <Button size="xs" variant="ghost" className="max-w-40">
          Copy a result with a long localized label
        </Button>
      </section>
      <section aria-label="Navigation">
        <Tabs defaultValue="one" orientation="vertical">
          <TabsList variant="line" aria-label="Views">
            <TabsTrigger value="one">Results</TabsTrigger>
            <TabsTrigger value="two">Readiness</TabsTrigger>
          </TabsList>
          <TabsContent value="one">Recent results</TabsContent>
          <TabsContent value="two">Account readiness</TabsContent>
        </Tabs>
      </section>
      <section aria-label="Iconless notice">
        <Alert
          compact
          showIcon={false}
          description="This compact notice has no leading icon."
          action={
            <AlertAction>
              <Button>Review details</Button>
            </AlertAction>
          }
        />
      </section>
      <section aria-label="Badges" className="flex gap-4">
        <Badge>Static status</Badge>
        <Badge asChild>
          <a href="#details">Open status</a>
        </Badge>
      </section>
      <section
        aria-label="Compact targets"
        className="flex items-center gap-8 py-4"
      >
        <Checkbox aria-label="Select account" defaultChecked="indeterminate" />
        <Switch
          aria-label="Enable sync"
          checked={enabled}
          onChange={setEnabled}
        />
        <Checkbox aria-label="Disabled selection" disabled />
        <Switch
          aria-label="Disabled sync"
          checked={false}
          onChange={setEnabled}
          disabled
        />
      </section>
      <section aria-label="Row actions">
        <Table>
          <TableBody>
            <TableRow>
              <TableCell>Account one</TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline">Account actions</Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem>Inspect account</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </section>
      <section aria-label="Textareas" className="flex flex-col gap-4">
        <Textarea aria-label="Valid JSON" defaultValue={'{"enabled": true}'} />
        <Textarea
          aria-label="Invalid JSON"
          aria-invalid
          defaultValue="{ invalid"
        />
      </section>
      <section aria-label="Scrollable choices">
        <Combobox
          items={Array.from({ length: 60 }, (_, i) => `Model ${i + 1}`)}
        >
          <ComboboxInput aria-label="Choose model" />
          <ComboboxContent>
            <ComboboxList className="max-h-40">
              {(item: string) => (
                <ComboboxItem key={item} value={item}>
                  {item}
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      </section>
      <div aria-hidden className="h-screen" />
    </main>
  )
}

const fixtureChannel = {
  name: "Example channel",
  type: "midjourney",
  resourceRef: createManagedUpstreamResourceRef({
    managedSiteType: "axonhub",
    scopeKey: "https://example.invalid",
    resourceId: "example",
  }),
}

createRoot(document.getElementById("root")!).render(<Fixtures />)
