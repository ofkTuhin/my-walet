'use client';

import { UserButton } from '@clerk/nextjs';
import { LayoutDashboard, ListOrdered, Menu, Settings, Tags, Wallet, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

import { ThemeToggle } from '@/components/theme-toggle';
import { cn } from '@/lib/utils';

/**
 * The application chrome: a persistent sidebar, a topbar, and the page slot.
 *
 * The sidebar is fixed on desktop and a slide-over on small screens — the
 * navigation should not consume a third of a phone viewport.
 */

const NAV = [
  { href: '/', label: 'Dashboard', Icon: LayoutDashboard },
  { href: '/transactions', label: 'Transactions', Icon: ListOrdered },
  { href: '/categories', label: 'Categories', Icon: Tags },
  { href: '/settings', label: 'Settings', Icon: Settings },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1 p-3">
      {NAV.map(({ href, label, Icon }) => {
        // Only "/" needs an exact match; every other route owns its subtree.
        const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
              active
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <div className="flex h-14 items-center gap-2 border-b px-5">
      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <Wallet className="h-4 w-4" />
      </div>
      <span className="font-semibold tracking-tight">Wallet</span>
    </div>
  );
}

export function AppShell({ title, actions, children }: {
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[16rem_1fr]">
      {/* Desktop sidebar */}
      <aside className="bg-card hidden border-r lg:block">
        <div className="sticky top-0">
          <Brand />
          <NavLinks />
        </div>
      </aside>

      {/* Mobile slide-over */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label="Close navigation"
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="bg-card absolute inset-y-0 left-0 w-64 border-r shadow-xl">
            <div className="flex items-center justify-between">
              <Brand />
            </div>
            <NavLinks onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-col">
        <header className="bg-background/80 sticky top-0 z-30 flex h-14 items-center gap-3 border-b px-4 backdrop-blur sm:px-6">
          <button
            type="button"
            aria-label="Open navigation"
            onClick={() => setMobileOpen(true)}
            className="hover:bg-accent -ml-1 rounded-md p-2 lg:hidden"
          >
            {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>

          <h1 className="truncate text-sm font-semibold tracking-tight sm:text-base">{title}</h1>

          <div className="ml-auto flex items-center gap-2">
            {actions}
            <ThemeToggle />
            <UserButton />
          </div>
        </header>

        <main className="min-w-0 flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
