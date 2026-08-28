import { handle } from "@astrojs/cloudflare/handler"
import type { ExportedHandler } from "@cloudflare/workers-types"
import registry from "./components/content-type-templates/registry.json"
import {
  runSchedulingWorkerCycle,
  setContentTypeRegistry,
  withBeaverRuntime,
  type CloudflareEnv,
} from "@zbeaver/beaver-cf/server"

// The registry is compiled into the Worker; no runtime filesystem lookup is
// available on Cloudflare Edge.
setContentTypeRegistry(registry)

type BeaverWorkerHandler = Omit<ExportedHandler<CloudflareEnv>, "fetch"> & {
  fetch: typeof handle
}

export default {
  fetch: handle,
  async scheduled(_controller, env) {
    await withBeaverRuntime(env, () => runSchedulingWorkerCycle())
  },
} satisfies BeaverWorkerHandler
