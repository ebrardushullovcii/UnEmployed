import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])'
].join(', ')

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(
    (element) =>
      !element.hasAttribute('hidden') &&
      element.getAttribute('aria-hidden') !== 'true' &&
      element.tabIndex >= 0 &&
      (element.offsetParent !== null || element === document.activeElement)
  )
}

export function useModalFocusTrap(open: boolean, dialogRef: RefObject<HTMLDivElement | null>, onClose: () => void) {
  const previousFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }

    const dialog = dialogRef.current
    if (!dialog) {
      return
    }

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null

    const appRoot = document.getElementById('root')
    const previousAriaHidden = appRoot?.getAttribute('aria-hidden') ?? null
    const hadInert = appRoot?.hasAttribute('inert') ?? false

    appRoot?.setAttribute('aria-hidden', 'true')
    appRoot?.setAttribute('inert', '')

    const focusableElements = getFocusableElements(dialog)
    ;(focusableElements[0] ?? dialog).focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }

      if (event.key !== 'Tab') {
        return
      }

      const nextFocusableElements = getFocusableElements(dialog)
      if (nextFocusableElements.length === 0) {
        event.preventDefault()
        dialog.focus()
        return
      }

      const firstFocusable = nextFocusableElements[0]
      const lastFocusable = nextFocusableElements[nextFocusableElements.length - 1]
      if (!firstFocusable || !lastFocusable) {
        event.preventDefault()
        dialog.focus()
        return
      }

      const activeElement =
        document.activeElement instanceof HTMLElement ? document.activeElement : null

      if (!dialog.contains(activeElement)) {
        event.preventDefault()
        ;(event.shiftKey ? lastFocusable : firstFocusable).focus()
        return
      }

      if (!event.shiftKey && activeElement === lastFocusable) {
        event.preventDefault()
        firstFocusable.focus()
        return
      }

      if (event.shiftKey && activeElement === firstFocusable) {
        event.preventDefault()
        lastFocusable.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)

      if (appRoot) {
        if (previousAriaHidden === null) {
          appRoot.removeAttribute('aria-hidden')
        } else {
          appRoot.setAttribute('aria-hidden', previousAriaHidden)
        }

        if (hadInert) {
          appRoot.setAttribute('inert', '')
        } else {
          appRoot.removeAttribute('inert')
        }
      }

      previousFocusRef.current?.focus()
    }
  }, [dialogRef, onClose, open])
}
