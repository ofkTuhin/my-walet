'use client';

import { UserButton } from '@clerk/nextjs';
import { LayoutDashboard, ListOrdered, Menu, Settings, Tags, Wallet } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

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

/** How long the drawer takes to slide; the unmount is delayed to match. */
const DRAWER_MS = 260;

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
              'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium',
              'transition-[color,background-color,transform] duration-200',
              'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
              active
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground hover:translate-x-0.5',
            )}
          >
            {/* A rail that grows in on the active item, so moving between pages
                reads as the marker travelling rather than the label recolouring. */}
            <span
              aria-hidden
              className={cn(
                'bg-primary absolute top-1/2 left-0 h-5 w-0.5 -translate-y-1/2 rounded-r-full',
                'origin-center transition-transform duration-300 ease-out-quart',
                active ? 'scale-y-100' : 'scale-y-0',
              )}
            />
            <Icon
              className={cn(
                'h-4 w-4 shrink-0 transition-transform duration-200',
                !active && 'group-hover:scale-110',
              )}
            />
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
      <div className="bg-primary text-primary-foreground flex h-7 w-7 items-center justify-center rounded-md transition-transform duration-300 hover:rotate-6 hover:scale-105">
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
  // Two flags, because an element cannot animate out after it has unmounted:
  // `mounted` keeps it in the DOM, `open` drives the transition.
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  function openDrawer() {
    setMounted(true);
    // Next frame, so the browser has an "off-screen" style to animate away from.
    requestAnimationFrame(() => setOpen(true));
  }

  const closeDrawer = useCallback(() => {
    setOpen(false);
    setTimeout(() => setMounted(false), DRAWER_MS);
  }, []);

  // Escape closes the drawer, and the page behind it stops scrolling while
  // it is open — a panel you can scroll out from under is disorienting.
  useEffect(() => {
    if (!mounted) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeDrawer();
    };
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [mounted, closeDrawer]);

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
      {mounted && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label="Close navigation"
            onClick={closeDrawer}
            className={cn(
              'absolute inset-0 bg-black/50 backdrop-blur-[2px] transition-opacity duration-200',
              open ? 'opacity-100' : 'opacity-0',
            )}
          />
          <aside
            className={cn(
              'bg-card absolute inset-y-0 left-0 w-64 border-r shadow-xl',
              'transition-transform duration-[260ms] ease-out-quart',
              open ? 'translate-x-0' : '-translate-x-full',
            )}
          >
            <Brand />
            <NavLinks onNavigate={closeDrawer} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-col">
        <header className="bg-background/80 sticky top-0 z-30 flex h-14 items-center gap-3 border-b px-4 backdrop-blur sm:px-6">
          <button
            type="button"
            aria-label="Open navigation"
            aria-expanded={open}
            onClick={openDrawer}
            className="hover:bg-accent -ml-1 rounded-md p-2 transition-[background-color,transform] duration-200 active:scale-90 lg:hidden"
          >
            <Menu className="h-4 w-4" />
          </button>

          <h1 className="truncate text-sm font-semibold tracking-tight sm:text-base">{title}</h1>

          <div className="ml-auto flex items-center gap-2">
            {actions}
            <ThemeToggle />
            <UserButton />
          </div>
        </header>

        {/* Keyed on the route so navigating replays the entrance: the content
            swap is otherwise instantaneous and easy to miss. */}
        <main key={pathname} className="animate-enter min-w-0 flex-1 p-4 sm:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
