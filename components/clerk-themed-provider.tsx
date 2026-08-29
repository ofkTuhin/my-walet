'use client';

import { ClerkProvider } from '@clerk/nextjs';
import { dark, shadcn } from '@clerk/themes';

import { useTheme } from '@/components/theme-provider';

/**
 * Clerk renders its own UI with its own styling, so it does not inherit the
 * `.dark` class the rest of the app uses. Without this, the sign-in card and
 * the user menu stay white on a dark page — the single most obvious tell that
 * a dark theme was bolted on.
 *
 * Sits inside ThemeProvider so it can react to the resolved theme rather than
 * the raw preference: "system" has to become light or dark before Clerk can
 * be told which to use.
 */
export function ClerkThemedProvider({ children }: { children: React.ReactNode }) {
  const { resolved } = useTheme();

  return (
    <ClerkProvider
      appearance={{
        // `shadcn` reads the same CSS variables this app already defines
        // (--background, --primary, --border, --radius...), so the widget
        // inherits the product's palette instead of approximating it.
        // `dark` is layered on top because those variables only flip when the
        // `.dark` class is present, which Clerk's own DOM does not inherit.
        theme: resolved === 'dark' ? [shadcn, dark] : shadcn,
      }}
    >
      {children}
    </ClerkProvider>
  );
}
