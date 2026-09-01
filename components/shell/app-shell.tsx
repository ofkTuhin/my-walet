'use client';

import { UserButton } from '@clerk/nextjs';
import { HandCoins, LayoutDashboard, ListOrdered, Settings, Tags, Wallet } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { ThemeToggle } from '@/components/theme-toggle';
import { cn } from '@/lib/utils';

/**
 * The application chrome: a sidebar on desktop, a bottom tab bar on phones,
 * and the page slot between them.
 *
 * Phones get tabs rather than a drawer because the destinations are few and
 * fixed. A drawer hides them behind a tap and puts them at the top of a screen
 * that is held at the bottom; tabs are always visible and within thumb reach.
 */

const NAV = [
  { href: '/', label: 'Dashboard', Icon: LayoutDashboard },
  { href: '/transactions', label: 'Transactions', Icon: ListOrdered },
  { href: '/debts', label: 'Debts', Icon: HandCoins },
  { href: '/categories', label: 'Categories', Icon: Tags },
  { href: '/settings', label: 'Settings', Icon: Settings },
];

/** Only "/" needs an exact match; every other route owns its subtree. */
function isActive(href: string, pathname: string): boolean {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

function SidebarLinks() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1 p-3">
      {NAV.map(({ href, label, Icon }) => {
        const active = isActive(href, pathname);
        return (
          <Link
            key={href}
            href={href}
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

function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className={cn(
        'bg-background/95 fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur lg:hidden',
        'grid grid-cols-5',
      )}
      // The home indicator on a full-screen iOS install sits over this bar, so
      // the row is lifted clear of it rather than being tapped through.
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {NAV.map(({ href, label, Icon }) => {
        const active = isActive(href, pathname);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'relative flex min-w-0 flex-col items-center justify-center gap-1 px-1 py-2',
              'transition-colors duration-200 active:scale-95',
              'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset',
              active ? 'text-primary' : 'text-muted-foreground',
            )}
          >
            {/* Sits on the border itself, so the active tab reads as attached
                to the bar rather than floating inside it. */}
            <span
              aria-hidden
              className={cn(
                'bg-primary absolute top-0 h-0.5 w-8 rounded-b-full',
                'origin-center transition-transform duration-300 ease-out-quart',
                active ? 'scale-x-100' : 'scale-x-0',
              )}
            />
            <Icon className={cn('h-5 w-5 shrink-0 transition-transform duration-200', active && 'scale-110')} />
            <span className="w-full truncate text-center text-[10px] leading-none font-medium">
              {label}
            </span>
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
  const pathname = usePathname();

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[16rem_1fr]">
      <aside className="bg-card hidden border-r lg:block">
        <div className="sticky top-0">
          <Brand />
          <SidebarLinks />
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="bg-background/80 sticky top-0 z-30 flex h-14 items-center gap-3 border-b px-4 backdrop-blur sm:px-6">
          {/* The sidebar carries the brand on desktop; without it, a phone would
              otherwise show no mark at all. */}
          <div className="bg-primary text-primary-foreground flex h-7 w-7 shrink-0 items-center justify-center rounded-md lg:hidden">
            <Wallet className="h-4 w-4" />
          </div>

          <h1 className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight sm:text-base">
            {title}
          </h1>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            {actions}
            <ThemeToggle />
            <UserButton />
          </div>
        </header>

        {/* Keyed on the route so navigating replays the entrance: the content
            swap is otherwise instantaneous and easy to miss.
            The bottom padding clears the tab bar, which is fixed and would
            otherwise cover the last row of a table. */}
        <main
          key={pathname}
          className="animate-enter min-w-0 flex-1 p-4 pb-[calc(4.75rem+env(safe-area-inset-bottom))] sm:p-6 sm:pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-6"
        >
          {children}
        </main>
      </div>

      <BottomNav />
    </div>
  );
}
