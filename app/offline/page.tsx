import { WifiOff } from 'lucide-react';

/**
 * Served by the service worker when a navigation cannot reach the network.
 *
 * Static and self-contained on purpose: it has to render with no session, no
 * API and no data, so it deliberately shows no figures at all. A cached
 * balance would be worse than none — it would look current.
 */
export const metadata = { title: 'Offline — Wallet' };

export default function OfflinePage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="bg-card w-full max-w-sm rounded-xl border p-8 text-center shadow-sm">
        <div className="bg-muted mx-auto flex h-12 w-12 items-center justify-center rounded-full">
          <WifiOff className="text-muted-foreground h-5 w-5" />
        </div>
        <h1 className="mt-4 text-lg font-semibold tracking-tight">You are offline</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Your wallet needs a connection to show figures you can trust, so nothing is shown
          from an old copy. Reconnect and try again.
        </p>
      </div>
    </main>
  );
}
