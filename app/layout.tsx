import type { Metadata } from 'next';

import { ClerkThemedProvider } from '@/components/clerk-themed-provider';
import { ThemeProvider, themeInitScript } from '@/components/theme-provider';
import './globals.css';

export const metadata: Metadata = {
  title: 'Wallet Dashboard',
  description: 'Personal wallet management, backed by an MCP server and PostgreSQL.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Applies the stored theme before first paint, so a dark-mode user
            never sees a white flash. Must be inline and before the body. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body
        className="min-h-screen bg-background font-sans text-foreground antialiased"
        suppressHydrationWarning
      >
        {/* ThemeProvider wraps Clerk so the widget can follow the resolved theme. */}
        <ThemeProvider>
          <ClerkThemedProvider>{children}</ClerkThemedProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
