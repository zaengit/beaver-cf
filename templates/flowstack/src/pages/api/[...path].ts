import { apiApp } from "@zbeaver/beaver-cf/server"

export const prerender = false

export const ALL = ({ request }: { request: Request }) => apiApp.fetch(request)
