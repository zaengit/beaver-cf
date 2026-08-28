import { useEffect, useState } from "react"
import { useLocation, useNavigate } from "react-router"
import { Eye, Inbox } from "lucide-react"

import { adminApiGet } from "@zbeaver/beaver/ui/shared/api-client"
import { AdminLoadingState } from "@zbeaver/beaver/ui/core/loading-state"
import {
  AdminBulkActionsBar,
  AdminErrorState,
  AdminListPagination,
  buildAdminListSearchParams,
  getAdminListPage,
  useAdminBulkActions,
  useAdminListFilters,
  useAdminListSelection,
} from "@zbeaver/beaver/ui/shared"
import { AdminPageHeader, AdminPageShell } from "@zbeaver/beaver/ui/layout/page-shell"
import { Button } from "@zbeaver/beaver/ui/components/ui/button"
import { Checkbox } from "@zbeaver/beaver/ui/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@zbeaver/beaver/ui/components/ui/dialog"
import { Input } from "@zbeaver/beaver/ui/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@zbeaver/beaver/ui/components/ui/table"
import type {
  AdminContactSubmission,
  AdminContactSubmissionListResponse,
  AdminContactSubmissionListItem,
} from "@zbeaver/beaver/ui/shared/data"

const LIST_PATH = "/admin/contact-submissions"

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp * 1000))
}

function submissionLabel(submission: AdminContactSubmissionListItem) {
  return submission.subject || "No subject"
}

export function AdminContactSubmissionsPage() {
  const [data, setData] = useState<AdminContactSubmissionListResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedSubmission, setSelectedSubmission] = useState<AdminContactSubmission | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [isDetailLoading, setIsDetailLoading] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const { filters, setFilter, handleKeyDown, buildPageUrl } = useAdminListFilters({
    locationSearch: location.search,
    navigate,
    path: LIST_PATH,
    defaults: { search: "" },
  })
  const {
    selectedIds,
    clearSelection,
    handleSelectAll,
    handleSelectOne,
    isAllSelected,
    isSomeSelected,
  } = useAdminListSelection(data?.data ?? null)
  const { isPending, performBulkAction } = useAdminBulkActions({
    selectedIds,
    entity: "contact submissions",
    successAction: "delete",
    onSuccess: async () => {
      closeDetails()
      await loadSubmissions()
    },
  })

  async function loadSubmissions() {
    setError(null)
    const query = buildAdminListSearchParams(filters, {
      page: getAdminListPage(location.search),
      perPage: 10,
    }).toString()
    const nextData = await adminApiGet<AdminContactSubmissionListResponse>(
      `/api/admin/contact-submissions${query ? `?${query}` : ""}`,
    )
    setData(nextData)
    clearSelection()
  }

  useEffect(() => {
    void loadSubmissions().catch((reason) => {
      setError(reason instanceof Error ? reason.message : "Failed to load contact submissions")
    })
  }, [location.search])

  useEffect(() => {
    if (!selectedId) {
      setSelectedSubmission(null)
      setDetailError(null)
      setIsDetailLoading(false)
      return
    }

    let active = true
    setSelectedSubmission(null)
    setDetailError(null)
    setIsDetailLoading(true)

    void adminApiGet<AdminContactSubmission>(`/api/admin/contact-submissions/${encodeURIComponent(selectedId)}`)
      .then((submission) => {
        if (active) setSelectedSubmission(submission)
      })
      .catch((reason) => {
        if (active) setDetailError(reason instanceof Error ? reason.message : "Failed to load contact submission")
      })
      .finally(() => {
        if (active) setIsDetailLoading(false)
      })

    return () => {
      active = false
    }
  }, [selectedId])

  function closeDetails() {
    setSelectedId(null)
    setSelectedSubmission(null)
    setDetailError(null)
  }

  function handleBulkDelete() {
    if (selectedIds.length === 0 || isPending) return
    if (!confirm(`Delete ${selectedIds.length} selected contact submission(s)? This cannot be undone.`)) return
    void performBulkAction("/api/admin/contact-submissions/bulk/delete")
  }

  if (error) return <AdminErrorState message={error} />
  if (!data) return <AdminLoadingState />

  return (
    <AdminPageShell>
      <AdminPageHeader
        title="Contact submissions"
        search={
          <Input
            placeholder="Search name, email, subject…"
            value={filters.search}
            onChange={(event) => setFilter("search", event.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full max-w-xs"
          />
        }
      />

      <div className="space-y-4 p-4">
        {isSomeSelected && (
          <AdminBulkActionsBar
            selectedCount={selectedIds.length}
            isPending={isPending}
            actions={[{ label: "Delete selected", onClick: handleBulkDelete, variant: "destructive" }]}
            onClear={clearSelection}
          />
        )}

        <div className="overflow-x-auto rounded-sm border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/35 hover:bg-muted/35">
                <TableHead className="w-10 px-4 py-3">
                  <Checkbox
                    checked={isAllSelected}
                    disabled={isPending}
                    onCheckedChange={(checked) => handleSelectAll(checked === true)}
                    aria-label="Select all contact submissions"
                  />
                </TableHead>
                <TableHead className="px-4 py-3">Sender</TableHead>
                <TableHead className="px-4 py-3">Subject</TableHead>
                <TableHead className="px-4 py-3">Received</TableHead>
                <TableHead className="px-4 py-3 text-right">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="px-4 py-12 text-center">
                    <Inbox className="mx-auto size-10 text-muted-foreground/40" />
                    <p className="mt-3 text-sm text-muted-foreground">No contact submissions found.</p>
                  </TableCell>
                </TableRow>
              ) : data.data.map((submission) => (
                <TableRow key={submission.id} className="hover:bg-muted/25">
                  <TableCell className="w-10 px-4 py-3">
                    <Checkbox
                      checked={selectedIds.includes(submission.id)}
                      disabled={isPending}
                      onCheckedChange={(checked) => handleSelectOne(submission.id, checked === true)}
                      aria-label={`Select submission from ${submission.name}`}
                    />
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <div className="font-medium">{submission.name}</div>
                    <a
                      href={`mailto:${submission.email}`}
                      className="text-sm text-muted-foreground underline-offset-4 hover:underline"
                    >
                      {submission.email}
                    </a>
                  </TableCell>
                  <TableCell className="max-w-[28rem] px-4 py-3">
                    <span className="block truncate">{submissionLabel(submission)}</span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                    {formatDate(submission.createdAt)}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`View submission from ${submission.name}`}
                      title="View submission"
                      onClick={() => setSelectedId(submission.id)}
                    >
                      <Eye />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <AdminListPagination meta={data.meta} getPageUrl={buildPageUrl} />
      </div>

      <Dialog open={Boolean(selectedId)} onOpenChange={(open) => { if (!open) closeDetails() }}>
        <DialogContent className="w-[calc(100%-1rem)] max-w-2xl sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Contact submission</DialogTitle>
            <DialogDescription>
              {selectedSubmission
                ? `${selectedSubmission.name} · ${formatDate(selectedSubmission.createdAt)}`
                : "Loading submission details…"}
            </DialogDescription>
          </DialogHeader>

          {isDetailLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading submission details…</p>
          ) : detailError ? (
            <p className="py-8 text-center text-sm text-destructive">{detailError}</p>
          ) : selectedSubmission ? (
            <div className="max-h-[65vh] space-y-5 overflow-y-auto pr-1">
              <dl className="grid gap-4 rounded-sm border bg-muted/20 p-4 text-sm sm:grid-cols-2">
                <div className="min-w-0">
                  <dt className="text-xs text-muted-foreground">Name</dt>
                  <dd className="mt-1 break-words font-medium">{selectedSubmission.name}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-xs text-muted-foreground">Email</dt>
                  <dd className="mt-1 break-all font-medium">
                    <a href={`mailto:${selectedSubmission.email}`} className="underline underline-offset-4">
                      {selectedSubmission.email}
                    </a>
                  </dd>
                </div>
                <div className="min-w-0 sm:col-span-2">
                  <dt className="text-xs text-muted-foreground">Subject</dt>
                  <dd className="mt-1 break-words font-medium">{submissionLabel(selectedSubmission)}</dd>
                </div>
              </dl>

              <section className="space-y-2">
                <h3 className="text-sm font-medium">Message</h3>
                <p className="whitespace-pre-wrap break-words rounded-sm border bg-muted/20 p-4 text-sm leading-6">
                  {selectedSubmission.message}
                </p>
              </section>

              <dl className="grid gap-3 border-t pt-4 text-xs text-muted-foreground sm:grid-cols-2">
                <div>
                  <dt>Received</dt>
                  <dd className="mt-1 text-foreground">{formatDate(selectedSubmission.createdAt)}</dd>
                </div>
                <div>
                  <dt>IP address</dt>
                  <dd className="mt-1 break-all text-foreground">{selectedSubmission.ipAddress || "Unknown"}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt>Browser</dt>
                  <dd className="mt-1 break-words text-foreground">{selectedSubmission.userAgent || "Unknown"}</dd>
                </div>
              </dl>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </AdminPageShell>
  )
}
