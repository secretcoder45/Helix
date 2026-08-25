import { Search, Loader2, X } from 'lucide-react'

export function SearchBar({ value, onChange, placeholder, isFetching }) {
  return (
    <div className="relative">
      <Search
        size={18}
        className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
      />
      <input
        autoFocus
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-slate-200 bg-white py-3.5 pl-11 pr-11 text-[15px] shadow-sm outline-none transition-shadow focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-900 dark:focus:border-indigo-500"
      />
      <div className="absolute right-4 top-1/2 -translate-y-1/2">
        {isFetching ? (
          <Loader2 size={16} className="animate-spin text-indigo-400" />
        ) : value ? (
          <button
            onClick={() => onChange('')}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X size={16} />
          </button>
        ) : null}
      </div>
    </div>
  )
}
