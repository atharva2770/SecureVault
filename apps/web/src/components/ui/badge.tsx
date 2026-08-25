import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

/*
  Badge / Pill — compact status label. Used for "Restricted", role badges and
  status tags. Tinted variants use the accent/state tokens at low alpha so they
  read on both themes.
*/
const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border font-medium whitespace-nowrap [&_svg]:size-3 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        neutral: 'border-sv-border bg-sv-surface-2 text-sv-text-muted',
        accent: 'border-sv-accent/30 bg-sv-accent/15 text-sv-accent',
        success: 'border-sv-success/30 bg-sv-success/15 text-sv-success',
        danger: 'border-sv-danger/30 bg-sv-danger/15 text-sv-danger',
        warning: 'border-sv-warning/30 bg-sv-warning/15 text-sv-warning',
        outline: 'border-sv-border bg-transparent text-sv-text-muted'
      },
      size: {
        sm: 'px-2 py-0.5 text-2xs',
        md: 'px-2.5 py-0.5 text-xs'
      }
    },
    defaultVariants: {
      variant: 'neutral',
      size: 'md'
    }
  }
)

type BadgeProps = React.ComponentProps<'span'> &
  VariantProps<typeof badgeVariants> & {
    asChild?: boolean
  }

function Badge({ className, variant, size, asChild = false, ...props }: BadgeProps): React.JSX.Element {
  const Comp = asChild ? Slot : 'span'
  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant, size }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
