import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

/*
  Button — token-driven, cva variants, renders as any element via `asChild`.

  Requested variants: primary (gradient accent), outline, ghost, danger.
  `secondary` and the `icon` size are retained because existing screens depend
  on them. No hardcoded colors: everything resolves from Prompt 1 tokens.
*/
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium outline-none transition-all focus-visible:border-sv-accent focus-visible:ring-2 focus-visible:ring-sv-accent/50 disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        primary:
          'bg-[linear-gradient(135deg,var(--accent-primary),var(--accent-2))] text-sv-accent-fg shadow-sm hover:brightness-110 active:brightness-95',
        secondary:
          'border border-sv-border bg-sv-surface-2 text-sv-text hover:border-sv-border-2 hover:bg-sv-surface-raised',
        outline:
          'border border-sv-border bg-transparent text-sv-text hover:border-sv-border-2 hover:bg-sv-surface-2',
        ghost: 'bg-transparent text-sv-text hover:bg-sv-surface-2',
        danger:
          'bg-sv-danger text-sv-accent-fg shadow-sm hover:brightness-110 active:brightness-95'
      },
      size: {
        sm: 'h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5',
        md: 'h-9 px-4 py-2 has-[>svg]:px-3',
        lg: 'h-10 rounded-md px-6 text-base has-[>svg]:px-4',
        icon: 'size-9'
      }
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md'
    }
  }
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }): React.JSX.Element {
  const Comp = asChild ? Slot : 'button'

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
