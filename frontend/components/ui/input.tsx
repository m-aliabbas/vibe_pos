import * as React from "react"

import { cn } from "@/lib/utils"
import { amountInWords } from "@/lib/words"

type InputProps = React.ComponentProps<"input"> & {
  /** Money field: show the typed amount in words underneath (e.g. "One Thousand Rupees Only"). */
  showWords?: boolean
}

function Input({ className, type, showWords, ...props }: InputProps) {
  const input = (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  )
  if (!showWords) return input
  const words = amountInWords(props.value as string | number | undefined)
  return (
    <>
      {input}
      <AmountWords text={words} />
    </>
  )
}

/** Small line that spells out an amount. Renders nothing when there is no amount. */
function AmountWords({ text, value, className }: { text?: string; value?: number | string | null; className?: string }) {
  const words = text ?? amountInWords(value)
  if (!words) return null
  return (
    <p data-slot="amount-words" className={cn("mt-1 text-xs leading-snug text-muted-foreground", className)} aria-live="polite">
      {words}
    </p>
  )
}

export { Input, AmountWords }
