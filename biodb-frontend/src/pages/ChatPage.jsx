import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowUp, ExternalLink, Sparkles, AlertCircle } from 'lucide-react'
import { useChat } from '../lib/api'
import { LogoMark } from '../components/Logo'
import { PageHeader, Scroller } from '../components/ui'

const SUGGESTIONS = [
  'What does the BRCA1 protein do in DNA repair?',
  'How does insulin regulate blood glucose?',
  'Explain the glycolysis pathway',
  'What is the role of TP53 in cancer?',
]

function Sources({ sources }) {
  if (!sources?.length) return null
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line pt-2.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-3">
        Sources
      </span>
      {sources.map((src, i) => {
        const label = src.includes('uniprot')
          ? src.split('/').pop()
          : src.includes('ncbi')
            ? `NCBI ${src.split('/').pop()}`
            : `Source ${i + 1}`
        return (
          <a
            key={i}
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-line px-1.5 py-0.5 font-mono text-[10px] text-ink-2 transition-colors hover:border-accent hover:text-accent"
          >
            {label} <ExternalLink size={9} />
          </a>
        )
      })}
    </div>
  )
}

export function ChatPage() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const chat = useChat()
  const endRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, chat.isPending])

  const send = (text) => {
    const query = text.trim()
    if (!query || chat.isPending) return

    setMessages((prev) => [...prev, { role: 'user', content: query }])
    setInput('')

    chat.mutate(query, {
      onSuccess: (data) =>
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: data.response, sources: data.sources },
        ]),
      onError: () =>
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', error: true, content: 'Could not reach the assistant.' },
        ]),
    })
  }

  return (
    <>
      <PageHeader
        eyebrow="Assistant"
        title="Ask about the literature"
        description="Answers are grounded in live UniProt, NCBI, and KEGG records, with the sources cited beneath each response."
      />

      <Scroller className="px-8">
        <div className="mx-auto max-w-3xl py-6">
          {messages.length === 0 ? (
            <div className="pt-6">
              <div className="mb-5 flex flex-col items-center text-center">
                <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-accent-soft text-accent">
                  <LogoMark size={22} />
                </span>
                <p className="font-display text-[17px] font-semibold text-ink">
                  What are you looking into?
                </p>
                <p className="mt-1 max-w-md text-[13px] text-ink-3">
                  Every answer is checked against live database records, not recalled from
                  memory alone.
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="rounded-xl border border-line bg-surface p-3.5 text-left text-[13px] leading-relaxed text-ink-2 transition-colors hover:border-accent-line hover:bg-accent-soft hover:text-ink"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <AnimatePresence initial={false}>
                {messages.map((m, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.16 }}
                    className={m.role === 'user' ? 'flex justify-end' : ''}
                  >
                    {m.role === 'user' ? (
                      <div className="max-w-[80%] rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-[13px] leading-relaxed text-accent-contrast">
                        {m.content}
                      </div>
                    ) : (
                      <div className="flex gap-3">
                        <span
                          className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                            m.error ? 'bg-danger-soft text-danger' : 'bg-accent-soft text-accent'
                          }`}
                        >
                          {m.error ? <AlertCircle size={14} /> : <LogoMark size={15} />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="whitespace-pre-wrap font-display text-[15px] leading-[1.68] text-ink">
                            {m.content}
                          </div>
                          <Sources sources={m.sources} />
                        </div>
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>

              {chat.isPending && (
                <div className="flex gap-3">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                    <LogoMark size={15} />
                  </span>
                  <div className="flex items-center gap-1 pt-2">
                    {[0, 1, 2].map((i) => (
                      <motion.span
                        key={i}
                        className="h-1.5 w-1.5 rounded-full bg-ink-3"
                        animate={{ opacity: [0.25, 1, 0.25] }}
                        transition={{ repeat: Infinity, duration: 1.1, delay: i * 0.18 }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <div ref={endRef} />
        </div>
      </Scroller>

      <div className="shrink-0 border-t border-line bg-surface px-8 py-4">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            send(input)
          }}
          className="mx-auto flex max-w-3xl items-end gap-2"
        >
          <div className="relative flex-1">
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send(input)
                }
              }}
              placeholder="Ask about a gene, protein, or pathway…"
              className="max-h-40 w-full resize-none rounded-xl border border-line bg-paper px-3.5 py-3 pr-3 text-[13px] leading-relaxed text-ink outline-none transition-colors placeholder:text-ink-3 focus:border-accent"
              disabled={chat.isPending}
            />
          </div>
          <button
            type="submit"
            disabled={chat.isPending || !input.trim()}
            className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-xl bg-accent text-accent-contrast transition-colors hover:bg-accent-hover disabled:opacity-40"
          >
            <ArrowUp size={17} />
          </button>
        </form>
        <p className="mx-auto mt-2 max-w-3xl text-[11px] text-ink-3">
          Verify results against the cited sources before using them in published work.
        </p>
      </div>
    </>
  )
}
