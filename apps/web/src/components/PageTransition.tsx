interface PageTransitionProps {
  viewKey: string
  children: React.ReactNode
  className?: string
}

/** Fade/slide in when `viewKey` changes. Honors prefers-reduced-motion via CSS. */
export function PageTransition({
  viewKey,
  children,
  className
}: PageTransitionProps): React.JSX.Element {
  return (
    <div key={viewKey} className={className ? `sv-page-enter ${className}` : 'sv-page-enter'}>
      {children}
    </div>
  )
}
