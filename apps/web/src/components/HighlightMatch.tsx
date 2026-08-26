import { splitHighlight } from '@/lib/highlight'

export function HighlightMatch({
  text,
  query,
  className
}: {
  text: string
  query: string
  className?: string
}): React.JSX.Element {
  if (!query.trim()) {
    return <span className={className}>{text}</span>
  }
  const parts = splitHighlight(text, query)
  return (
    <span className={className}>
      {parts.map((part, i) =>
        part.hit ? (
          <mark
            key={i}
            className="rounded-[2px] bg-sv-accent/20 px-0 text-sv-accent [box-decoration-break:clone]"
          >
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
    </span>
  )
}
