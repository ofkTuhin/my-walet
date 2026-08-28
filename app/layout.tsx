import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Wallet Dashboard',
  description: 'Personal wallet management, backed by an MCP server and PostgreSQL.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased" suppressHydrationWarning>{children}</body>
    </html>
  );
}
