import { useEffect } from 'react'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Comportamento comum de diálogos/sheets: Esc fecha, Tab fica preso dentro de
 * `ref`, o scroll do body é travado e o foco volta ao elemento anterior.
 */
export function useDialog(ref, open, onClose) {
  useEffect(() => {
    if (!open || !ref.current) return
    const root = ref.current
    const previous = document.activeElement
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    ;(root.querySelector('[data-autofocus]') || root.querySelector(FOCUSABLE))?.focus()

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      } else if (e.key === 'Tab') {
        const items = [...root.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null)
        if (!items.length) return
        const first = items[0]
        const last = items[items.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
        else if (!root.contains(document.activeElement)) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      if (previous instanceof HTMLElement) previous.focus()
    }
  }, [ref, open, onClose])
}
