import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, ExternalLink, Sparkles } from 'lucide-react'
import { useChat } from '../lib/api'

const SUGGESTIONS = [
  'What does insulin do in the human body?',
  'Tell me about the BRCA1 gene',
  'Explain the glycolysis pathway',
  'What is the function of the insulin receptor?',
]

export function ChatPage() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const chat = useChat()
  const endRef = useRef(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, chat.isPending])

  const send = (text) => {
    const query = text.trim()
    if (!query || chat.isPending) return

    setMessages((prev) => [...prev, { role: 'user', content: query }])
    setInput('')

    chat.mutate(query, {
      onSuccess: (data) => {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: data.response, sources: data.sources },
        ])
      },
      onError: () => {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: 'Sorry, something went wrong reaching the assistant.' },
        ])
      },
    })
  }

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col px-6 py-8">
      <div className="mb-6">
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          <Sparkles size={18} className="text-indigo-500" /> Bioinformatics Assistant
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Ask about proteins, genes, and pathways — answers are grounded in live database results.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto pb-4">
        {messages.length === 0 && (
          <div className="grid gap-2 sm:grid-cols-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="rounded-xl border border-slate-200 bg-white p-3 text-left text-sm text-slate-600 transition-colors hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-indigo-500"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        <div className="space-y-4">
          <AnimatePresence initial={false}>
            {messages.map((m, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                    m.role === 'user'
                      ? 'bg-indigo-500 text-white'
                      : 'border border-slate-200 bg-white text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200'
                  }`}
                >
                  <div className="whitespace-pre-wrap">{m.content}</div>
                  {m.sources?.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-2 dark:border-slate-800">
                      {m.sources.map((src, idx) => (
                        <a
                          key={idx}
                          href={src}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-indigo-500 hover:underline"
                        >
                          <ExternalLink size={11} /> Source {idx + 1}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {chat.isPending && (
            <div className="flex justify-start">
              <div className="flex items-center gap-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    className="h-1.5 w-1.5 rounded-full bg-slate-400"
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ repeat: Infinity, duration: 1, delay: i * 0.15 }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          send(input)
        }}
        className="flex gap-2 border-t border-slate-200 pt-4 dark:border-slate-800"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a bioinformatics question..."
          className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-900"
          disabled={chat.isPending}
        />
        <button
          type="submit"
          disabled={chat.isPending || !input.trim()}
          className="flex items-center gap-2 rounded-xl bg-indigo-500 px-4 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <Send size={15} />
        </button>
      </form>
    </div>
  )
}
