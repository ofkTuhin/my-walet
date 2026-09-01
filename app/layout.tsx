import type { Metadata, Viewport } from 'next';

import { AmbientBackground } from '@/components/ambient-background';
import { ClerkThemedProvider } from '@/components/clerk-themed-provider';
import { ServiceWorkerRegistration } from '@/components/service-worker';
import { ThemeProvider, themeInitScript } from '@/components/theme-provider';
import './globals.css';

export const metadata: Metadata = {
  title: 'Wallet Dashboard',
  description: 'Personal wallet management, backed by an MCP server and PostgreSQL.',
  // iOS ignores the manifest for these, so they have to be stated separately.
  appleWebApp: {
    capable: true,
    title: 'Wallet',
    statusBarStyle: 'default',
  },
  icons: {
    icon: [
      { url: '/icons/favicon-64.png', sizes: '64x64', type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  // Two colours so the system chrome follows the theme instead of pinning one.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fbfcfd' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0d14' },
  ],
  width: 'device-width',
  initialScale: 1,
  // Installed on a phone this is a full-screen app, so the safe area matters.
  viewportFit: 'cover',
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
        className="min-h-screen font-sans text-foreground antialiased"
        suppressHydrationWarning
      >
        <AmbientBackground />
        <ServiceWorkerRegistration />
        {/* ThemeProvider wraps Clerk so the widget can follow the resolved theme. */}
        <ThemeProvider>
          <ClerkThemedProvider>{children}</ClerkThemedProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
