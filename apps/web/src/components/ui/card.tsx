import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

/*
  Card — themed surface container. Used for module cards, subfolder cards and
  the login card. `interactive` adds a hover-lift + stronger shadow; `asChild`
  lets it render as an <a>/<button> for clickable cards.
*/
const cardVariants = cva('rounded-[var(--sv-radius)] text-sv-text', {
  variants: {
    variant: {
      surface: 'border border-sv-border bg-sv-surface shadow-card',
      elevated: 'border border-sv-border-2 bg-sv-surface-2 shadow-card',
      paper: 'border border-sv-paper-border bg-sv-paper text-sv-paper-text shadow-card'
    },
    interactive: {
      true: 'transition-all duration-200 hover:-translate-y-0.5 hover:shadow-modal focus-visible:ring-2 focus-visible:ring-sv-accent focus-visible:ring-offset-2 focus-visible:ring-offset-sv-bg motion-reduce:transition-none motion-reduce:hover:translate-y-0',
      false: ''
    }
  },
  defaultVariants: {
    variant: 'surface',
    interactive: false
  }
})

type CardProps = React.ComponentProps<'div'> &
  VariantProps<typeof cardVariants> & {
    asChild?: boolean
  }

function Card({ className, variant, interactive, asChild = false, ...props }: CardProps): React.JSX.Element {
  const Comp = asChild ? Slot : 'div'
  return (
    <Comp
      data-slot="card"
      className={cn(cardVariants({ variant, interactive }), className)}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>): React.JSX.Element {
  return (
    <div
      data-slot="card-header"
      className={cn('flex flex-col gap-1.5 p-5', className)}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<'h3'>): React.JSX.Element {
  return (
    <h3
      data-slot="card-title"
      className={cn('text-base font-semibold leading-tight tracking-tight', className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<'p'>): React.JSX.Element {
  return (
    <p
      data-slot="card-description"
      className={cn('text-sm text-sv-text-muted', className)}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>): React.JSX.Element {
  return <div data-slot="card-content" className={cn('p-5 pt-0', className)} {...props} />
}

function CardFooter({ className, ...props }: React.ComponentProps<'div'>): React.JSX.Element {
  return (
    <div
      data-slot="card-footer"
      className={cn('flex items-center gap-2 p-5 pt-0', className)}
      {...props}
    />
  )
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, cardVariants }
