'use client'

import { DayPicker } from 'react-day-picker'
import { ko } from 'react-day-picker/locale'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Editorial Calendar — react-day-picker v9 with PetMove editorial tone.
 *
 * Palette:
 * - Selected day: clay (#D9A489 / dark #C08C70) filled
 * - Today: olive serif italic ring
 * - Muted (prev/next month): muted-foreground
 * - Numbers: mono tabular-nums
 * - Header (month/year): serif
 */
export function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  return (
    <DayPicker
      locale={ko}
      showOutsideDays={showOutsideDays}
      className={cn('relative p-3 font-sans', className)}
      modifiers={{
        sunday: (date) => date.getDay() === 0,
        saturday: (date) => date.getDay() === 6,
      }}
      modifiersClassNames={{
        sunday: '[&>button]:text-pmw-cal-sunday',
        saturday: '[&>button]:text-pmw-cal-saturday',
      }}
      classNames={{
        months: 'flex flex-col sm:flex-row gap-4',
        month: 'flex flex-col gap-3',
        month_caption: 'flex items-center h-7 pt-1 px-1',
        caption_label:
          'font-serif text-[15px] text-foreground tracking-tight tabular-nums',
        nav: 'absolute top-3 right-3 flex items-center gap-1 z-10',
        button_previous: cn(
          'inline-flex h-7 w-7 items-center justify-center rounded-full',
          'text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors',
        ),
        button_next: cn(
          'inline-flex h-7 w-7 items-center justify-center rounded-full',
          'text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors',
        ),
        month_grid: 'w-full border-collapse',
        weekdays: cn(
          'flex text-muted-foreground/80',
          '[&>th:first-child]:text-pmw-cal-sunday [&>th:last-child]:text-pmw-cal-saturday',
        ),
        weekday:
          'w-9 h-8 text-center font-mono text-[10px] uppercase tracking-[1.3px]',
        week: 'flex w-full mt-0.5',
        day: 'relative p-0 text-center',
        day_button: cn(
          'h-9 w-9 p-0 inline-flex items-center justify-center rounded-full',
          'font-mono text-[13px] tabular-nums',
          'transition-colors',
          'hover:bg-accent/60',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-pmw-accent',
          'disabled:opacity-30 disabled:pointer-events-none',
        ),
        selected: cn(
          '[&>button]:bg-pmw-accent [&>button]:!text-pmw-accent-foreground [&>button]:font-semibold',
          '[&>button]:hover:bg-pmw-accent-strong',
        ),
        today: '[&>button]:font-serif [&>button]:italic [&>button]:!text-pmw-cal-today',
        outside: '[&>button]:opacity-40',
        disabled: '[&>button]:opacity-30 [&>button]:pointer-events-none',
        hidden: 'invisible',
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, ...rest }) => {
          return orientation === 'left' ? (
            <ChevronLeft size={16} {...rest} />
          ) : (
            <ChevronRight size={16} {...rest} />
          )
        },
      }}
      {...props}
    />
  )
}
