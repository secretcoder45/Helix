import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { AuthForm } from './AuthForm'

/**
 * Sign in without leaving the page — opened by a Save button when nobody is
 * signed in, so an unsaved batch result or alignment survives the detour.
 */
export function SignInDialog({ open, onOpenChange, onSignedIn }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[92vh] w-[calc(100vw-32px)] max-w-[400px] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-line bg-surface p-6 shadow-pop">
          <div className="flex items-start justify-between gap-4">
            <Dialog.Title className="font-display m-0 text-[21px] font-semibold text-ink">
              Sign in to save
            </Dialog.Title>
            <Dialog.Close className="rounded-md p-1 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink">
              <X size={16} />
              <span className="sr-only">Close</span>
            </Dialog.Close>
          </div>
          <Dialog.Description className="m-0 mb-5 mt-1.5 text-[13px] leading-relaxed text-ink-2">
            Saved results go into projects, which belong to an account. Your work on this page stays
            where it is.
          </Dialog.Description>
          <AuthForm
            heading={false}
            onDone={() => {
              onOpenChange(false)
              onSignedIn?.()
            }}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
