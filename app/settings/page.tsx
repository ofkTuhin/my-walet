'use client';

import { useEffect, useState } from 'react';

import { AppShell } from '@/components/shell/app-shell';
import { ThemeToggle } from '@/components/theme-toggle';

interface Health {
  status: string;
  service: string;
  askEnabled: boolean;
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="hover:bg-accent/30 flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4 transition-colors duration-200 last:border-0">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {hint ? <p className="text-muted-foreground mt-0.5 text-xs">{hint}</p> : null}
      </div>
      {children}
    </div>
  );
}

export default function SettingsPage() {
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    fetch('/api/wallet/health')
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => undefined);
  }, []);

  return (
    <AppShell title="Settings">
      <div className="max-w-2xl space-y-6">
        <section className="bg-card animate-enter rounded-xl border shadow-sm">
          <h2 className="border-b px-5 py-3 text-sm font-semibold">Appearance</h2>
          <Row label="Theme" hint="System follows your operating system setting.">
            <ThemeToggle />
          </Row>
        </section>

        <section
          className="bg-card animate-enter rounded-xl border shadow-sm"
          style={{ animationDelay: '70ms' }}
        >
          <h2 className="border-b px-5 py-3 text-sm font-semibold">Service</h2>
          <Row label="API" hint="Reachability of the wallet backend.">
            <span className="text-sm tabular-nums">
              {health ? (
                <span className="animate-enter-scale text-[var(--income)]">{health.status}</span>
              ) : (
                <span className="text-muted-foreground">checking…</span>
              )}
            </span>
          </Row>
          <Row
            label="Natural-language search"
            hint="Needs GROQ_API_KEY or ANTHROPIC_API_KEY on the server."
          >
            <span className="text-sm">
              {health === null ? (
                <span className="text-muted-foreground">checking…</span>
              ) : health.askEnabled ? (
                <span className="animate-enter-scale text-[var(--income)]">Enabled</span>
              ) : (
                <span className="animate-enter-scale text-muted-foreground">Not configured</span>
              )}
            </span>
          </Row>
        </section>

        <section
          className="bg-card animate-enter rounded-xl border shadow-sm"
          style={{ animationDelay: '140ms' }}
        >
          <h2 className="border-b px-5 py-3 text-sm font-semibold">Assistant access</h2>
          <div className="text-muted-foreground px-5 py-4 text-sm">
            <p>
              This wallet is also available to AI assistants through an MCP server, which exposes
              the same four tools the dashboard uses.
            </p>
            <p className="mt-2">
              It currently runs locally over stdio and is configured in your MCP client. Hosted,
              per-account access is not available yet.
            </p>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
