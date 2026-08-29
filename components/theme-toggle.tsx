'use client';

import { Monitor, Moon, Sun } from 'lucide-react';

import { useTheme, type Theme } from '@/components/theme-provider';
import { cn } from '@/lib/utils';

/**
 * A three-way segmented control rather than a two-state switch, because
 * "follow the system" is a distinct choice from having picked a side — and a
 * toggle cannot express it.
 *
 * The selected background is one element that slides between positions instead
 * of three that swap colour: the movement shows where the selection went.
 */

const OPTIONS: Array<{ value: Theme; label: string; Icon: typeof Sun }> = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor },
];

/** Button width (1.75rem) plus the gap between them (0.125rem). */
const STEP = '1.875rem';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const index = Math.max(0, OPTIONS.findIndex((option) => option.value === theme));

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className="bg-muted/40 relative inline-flex items-center gap-0.5 rounded-lg border p-0.5"
    >
      <span
        aria-hidden
        className="bg-background absolute top-0.5 left-0.5 h-7 w-7 rounded-md shadow-sm transition-transform duration-300 ease-spring"
        style={{ transform: `translateX(calc(${index} * ${STEP}))` }}
      />
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setTheme(value)}
            className={cn(
              // Above the sliding background, which is absolutely positioned.
              'relative z-10 inline-flex h-7 w-7 items-center justify-center rounded-md',
              'transition-[color,transform] duration-200 active:scale-90',
              'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
              active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        );
      })}
    </div>
  );
}
