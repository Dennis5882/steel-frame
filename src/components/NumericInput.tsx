import { useEffect, useRef, type InputHTMLAttributes } from 'react'

/** Clean arithmetic noise in computed values; typed input stays in its own raw string. */
export function inputNumberText(value: number): string {
  return Number.isNaN(value) ? '' : Number.isFinite(value) ? String(Number(value.toPrecision(12))) : String(value)
}

export function steppedValue(raw: string, direction: 1 | -1, step: number, min?: number): string | null {
  const value = Number(raw)
  if (!raw.trim() || !Number.isFinite(value) || !Number.isFinite(step) || step <= 0) return null
  // Positive fields stop before zero; explicit minima (including zero) are inclusive.
  const floor = min ?? Math.min(step, value > 0 ? value : step)
  return String(Number(Math.max(floor, value + direction * step).toFixed(10)))
}

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'step' | 'min'> {
  value: string; step: number; min?: number; onValueChange(value: string): void
}

/** Native non-passive wheel listener: React's delegated wheel listener cannot cancel scrolling. */
export function NumericInput({ value, step, min, onValueChange, onKeyDown, ...props }: Props) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const input = ref.current
    if (!input) return
    const wheel = (event: WheelEvent) => {
      if (document.activeElement !== input || input.disabled || input.readOnly || event.ctrlKey || event.metaKey || !event.deltaY) return
      event.preventDefault()
      event.stopPropagation()
      const next = steppedValue(input.value, event.deltaY < 0 ? 1 : -1, step, min)
      if (next !== null && next !== input.value) onValueChange(next)
    }
    input.addEventListener('wheel', wheel, { passive: false })
    return () => input.removeEventListener('wheel', wheel)
  }, [step, min, onValueChange])
  return <input {...props} ref={ref} value={value} inputMode={props.inputMode ?? 'decimal'}
    onChange={(e) => onValueChange(e.target.value)} onKeyDown={(e) => {
      onKeyDown?.(e)
      if (e.defaultPrevented || e.currentTarget.disabled || e.currentTarget.readOnly || e.ctrlKey || e.metaKey || e.altKey || !['ArrowUp', 'ArrowDown'].includes(e.key)) return
      e.preventDefault()
      const next = steppedValue(e.currentTarget.value, e.key === 'ArrowUp' ? 1 : -1, step, min)
      if (next !== null && next !== value) onValueChange(next)
    }} />
}
