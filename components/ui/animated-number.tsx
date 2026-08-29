'use client';

import { useCountUp } from '@/lib/hooks/use-motion';

interface AnimatedNumberProps {
  value: number;
  /** Renders the in-flight value — currency, plain integer, percentage. */
  format: (value: number) => string;
  duration?: number;
  className?: string;
}

/**
 * A figure that counts to its value instead of snapping to it.
 *
 * `tabular-nums` is not optional here: without fixed-width digits the text
 * reflows on every frame and the number jitters as it climbs.
 */
export function AnimatedNumber({ value, format, duration, className }: AnimatedNumberProps) {
  const current = useCountUp(value, duration);

  return (
    <span className={className} style={{ fontVariantNumeric: 'tabular-nums' }}>
      {format(current)}
    </span>
  );
}
