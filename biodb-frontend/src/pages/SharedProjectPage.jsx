import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { BookOpenText, ExternalLink, GitCompareArrows, LinkIcon } from 'lucide-react'
import { useSharedProject } from '../lib/api'
import { MethodsDialog } from '../components/MethodsDialog'
import { ProvenanceLine } from '../components/Provenance'
import { Button, Card, EmptyState, PageHeader, Scroller, Skeleton, SourceBadge } from '../components/ui'

/**
 * A project opened from a share link: everything the owner saved, with its
 * provenance and the methods export, and nothing that can change it. The
 * viewer needs no account — the link is the permission.
 */

export function SharedProjectPage() {
  const { token } = useParams()
  const { data: project, isLoading, isError } = useSharedProject(token)
  const [methodsOpen, setMethodsOpen] = useState(false)

  if (isError) {
    return (
      <Scroller className="px-8 py-12">
        <div className="mx-auto max-w-xl">
          <Card className="border-dashed">
            <EmptyState
              icon={LinkIcon}
              title="This link doesn’t work"
              description="It may have been mistyped, or the owner may have stopped sharing the project."
            />
          </Card>
        </div>
      </Scroller>
    )
  }

  const items = project?.items || []
  const alignments = project?.alignments || []

  return (
    <>
      <PageHeader
        eyebrow="Shared project · read-only"
        title={project ? project.name : 'Loading…'}
        description={
          project &&
          `Shared by ${project.owner || 'a Helix user'}. You can view it and its methods export; only the owner can change it.`
        }
        actions={
          project &&
          (items.length > 0 || alignments.length > 0) && (
            <Button variant="primary" onClick={() => setMethodsOpen(true)}>
              <BookOpenText size={14} /> Methods & references
            </Button>
          )
        }
      />

      <Scroller className="px-8 py-6">
        <div className="mx-auto max-w-4xl space-y-6">
          {isLoading && (
            <div className="space-y-2.5">
              <Skeleton className="h-16 rounded-xl" />
              <Skeleton className="h-16 rounded-xl" />
            </div>
          )}

          {project && items.length === 0 && alignments.length === 0 && (
            <Card className="border-dashed">
              <EmptyState icon={LinkIcon} title="Nothing in this project yet" />
            </Card>
          )}

          {items.length > 0 && (
            <section>
              <h2 className="m-0 mb-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">
                Records <span className="tnum font-normal">{items.length}</span>
              </h2>
              <Card className="divide-y divide-line overflow-hidden">
                {items.map((item) => (
                  <div key={item.id} className="flex items-start gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {item.database === 'UniProt' ? (
                          <Link
                            to={`/lookup?q=${encodeURIComponent(item.external_id)}`}
                            className="truncate text-[13px] font-medium text-ink hover:text-accent"
                          >
                            {item.name}
                          </Link>
                        ) : (
                          <span className="truncate text-[13px] font-medium text-ink">{item.name}</span>
                        )}
                        <SourceBadge source={item.database} />
                      </div>
                      {item.description && (
                        <p className="m-0 mt-0.5 line-clamp-1 text-[12px] text-ink-2">{item.description}</p>
                      )}
                      <p className="m-0 mt-1 font-mono text-[11px] text-ink-3">
                        {item.external_id}
                        {item.retrieved_at && ` · retrieved ${new Date(item.retrieved_at).toLocaleDateString()}`}
                      </p>
                      {item.provenance && (
                        <p className="m-0 mt-0.5 text-[10.5px] text-ink-3">
                          <ProvenanceLine provenance={{ ...item.provenance, helix: null }} />
                        </p>
                      )}
                    </div>
                    {item.link && (
                      <a
                        href={item.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Open ${item.name} at the source`}
                        className="shrink-0 rounded-md p-1.5 text-ink-3 transition-colors hover:bg-surface-2 hover:text-accent"
                      >
                        <ExternalLink size={13} />
                      </a>
                    )}
                  </div>
                ))}
              </Card>
            </section>
          )}

          {alignments.length > 0 && (
            <section>
              <h2 className="m-0 mb-2.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">
                <GitCompareArrows size={12} /> Alignments <span className="tnum font-normal">{alignments.length}</span>
              </h2>
              <Card className="divide-y divide-line overflow-hidden">
                {alignments.map((a) => (
                  <div key={a.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[12px] font-medium text-ink">
                        {a.label1} vs {a.label2}
                      </span>
                      <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-ink-3">
                        {a.algorithm === 'smith-waterman' ? 'Local' : 'Global'}
                      </span>
                    </div>
                    <p className="tnum m-0 mt-1 text-[11px] text-ink-2">
                      score {a.score} · {a.identity_pct}% identity · {a.gaps} gaps · {a.length} cols
                    </p>
                    {a.params?.matrix && (
                      <p className="m-0 mt-0.5 font-mono text-[10px] text-ink-3">
                        {a.params.matrix}, gap {a.params.gap_open}/{a.params.gap_extend}
                        {a.provenance?.helix?.version && ` · Helix ${a.provenance.helix.version}`}
                      </p>
                    )}
                  </div>
                ))}
              </Card>
            </section>
          )}
        </div>
      </Scroller>

      {project && (
        <MethodsDialog
          project={project}
          shareToken={token}
          open={methodsOpen}
          onOpenChange={setMethodsOpen}
        />
      )}
    </>
  )
}
