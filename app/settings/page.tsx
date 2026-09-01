'use client';

import { useEffect, useState } from 'react';

import { AppShell } from '@/components/shell/app-shell';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';

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

/**
 * Money already held before this wallet recorded anything.
 *
 * Everything else is derived from transactions, which start at zero — this is
 * the one figure that has to be told to the app rather than calculated.
 */
function OpeningBalanceRow() {
  const [value, setValue] = useState('');
  const [saved, setSaved] = useState<number | null>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    api
      .getAccount()
      .then((account) => {
        setSaved(account.openingBalance);
        setValue(String(account.openingBalance));
      })
      .catch(() => undefined);
  }, []);

  async function save() {
    const amount = Number(value);
    if (!Number.isFinite(amount)) {
      setStatus('error');
      setMessage('Enter a number.');
      return;
    }
    setStatus('saving');
    setMessage(null);
    try {
      const account = await api.setOpeningBalance(amount);
      setSaved(account.openingBalance);
      setValue(String(account.openingBalance));
      setStatus('done');
      setMessage('Saved. Your balance and every month now start from this.');
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Could not save that.');
    }
  }

  const dirty = saved !== null && Number(value) !== saved;

  return (
    <div className="border-b px-5 py-4 last:border-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Starting balance</p>
          <p className="text-muted-foreground mt-0.5 text-xs">
            What you already had before recording anything here.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            step="0.01"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-label="Starting balance"
            className="h-9 w-36 text-right"
          />
          <Button size="sm" onClick={() => void save()} disabled={status === 'saving' || !dirty}>
            {status === 'saving' ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
      {message ? (
        <p
          className={`mt-2 text-xs ${status === 'error' ? 'text-[var(--expense)]' : 'text-[var(--income)]'}`}
        >
          {message}
        </p>
      ) : saved !== null && !dirty ? (
        <p className="text-muted-foreground mt-2 text-xs">
          Currently {formatCurrency(saved)}.
        </p>
      ) : null}
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
          <h2 className="border-b px-5 py-3 text-sm font-semibold">Money</h2>
          <OpeningBalanceRow />
        </section>

        <section
          className="bg-card animate-enter rounded-xl border shadow-sm"
          style={{ animationDelay: '70ms' }}
        >
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
