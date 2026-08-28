import { getContentTypeRegistry } from "./content-types"

export function getServerContentTypeRegistry() {
  // Workers cannot inspect the host filesystem. Applications can register a
  // compiled registry once at their Worker entrypoint via setContentTypeRegistry.
  return getContentTypeRegistry()
}
