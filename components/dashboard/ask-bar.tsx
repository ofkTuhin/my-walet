'use client';

import { Loader2, Sparkles } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { WalletChart } from '@/components/dashboard/wallet-chart';
import { api, askFiltersToUiFilters } from '@/lib/api';
import type { AskResponse, TransactionFilters } from '@/lib/types';

const EXAMPLES = [
  'How much did I spend on groceries last month?',
  'My biggest expenses over $200',
  'Show me everything I earned in August',
  'Where does my money go — donut chart',
];

interface AskBarProps {
  /** Applies the filters Claude derived to the dashboard's filter controls. */
  onFilters: (filters: TransactionFilters) => void;
}

export function AskBar({ onFilters }: AskBarProps) {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState<AskResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    setLoading(true);
    setError(null);
    setAnswer(null);

    try {
      const response = await api.ask(trimmed);
      onFilters(askFiltersToUiFilters(response.filters));
      setAnswer(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit(question);
        }}
        className="flex flex-col gap-2 sm:flex-row"
      >
        <div className="relative flex-1">
          <Sparkles className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Ask in plain language — e.g. how much did I spend on food last month?"
            className="pl-9"
            aria-label="Ask a question about your wallet"
            disabled={loading}
          />
        </div>
        <Button type="submit" disabled={loading || !question.trim()}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {loading ? 'Thinking' : 'Ask'}
        </Button>
      </form>

      {!answer && !error ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => {
                setQuestion(example);
                void submit(example);
              }}
              disabled={loading}
              className="rounded-full border px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
            >
              {example}
            </button>
          ))}
        </div>
      ) : null}

      {answer ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-muted-foreground">{answer.headline}</p>
          <WalletChart
            type={answer.chart.type}
            data={answer.chart.data}
            typeFilter={answer.filters.type}
          />
        </div>
      ) : null}
      {error ? <p className="mt-3 text-sm text-[var(--expense)]">{error}</p> : null}
    </div>
  );
}
