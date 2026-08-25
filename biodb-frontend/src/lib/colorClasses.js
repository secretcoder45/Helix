// Static class lookup so Tailwind's compiler can see every class it needs to
// generate — template-string class names (e.g. `bg-${color}-500`) don't work
// with Tailwind's build-time scanning.
export const ACCENT = {
  emerald: {
    text: 'text-emerald-600 dark:text-emerald-400',
    bg: 'bg-emerald-500',
    bgSoft: 'bg-emerald-50 dark:bg-emerald-500/10',
    border: 'border-emerald-500',
    ring: 'ring-emerald-500/30',
    dot: 'bg-emerald-500',
  },
  indigo: {
    text: 'text-indigo-600 dark:text-indigo-400',
    bg: 'bg-indigo-500',
    bgSoft: 'bg-indigo-50 dark:bg-indigo-500/10',
    border: 'border-indigo-500',
    ring: 'ring-indigo-500/30',
    dot: 'bg-indigo-500',
  },
  amber: {
    text: 'text-amber-600 dark:text-amber-400',
    bg: 'bg-amber-500',
    bgSoft: 'bg-amber-50 dark:bg-amber-500/10',
    border: 'border-amber-500',
    ring: 'ring-amber-500/30',
    dot: 'bg-amber-500',
  },
  sky: {
    text: 'text-sky-600 dark:text-sky-400',
    bg: 'bg-sky-500',
    bgSoft: 'bg-sky-50 dark:bg-sky-500/10',
    border: 'border-sky-500',
    ring: 'ring-sky-500/30',
    dot: 'bg-sky-500',
  },
  rose: {
    text: 'text-rose-600 dark:text-rose-400',
    bg: 'bg-rose-500',
    bgSoft: 'bg-rose-50 dark:bg-rose-500/10',
    border: 'border-rose-500',
    ring: 'ring-rose-500/30',
    dot: 'bg-rose-500',
  },
  slate: {
    text: 'text-slate-600 dark:text-slate-400',
    bg: 'bg-slate-500',
    bgSoft: 'bg-slate-100 dark:bg-slate-500/10',
    border: 'border-slate-500',
    ring: 'ring-slate-500/30',
    dot: 'bg-slate-500',
  },
}
