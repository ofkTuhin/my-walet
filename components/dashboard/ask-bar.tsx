'use client';

import { Loader2, Sparkles } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { WalletChart } from '@/components/dashboard/wallet-chart';
import { api, askFiltersToUiFilters } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { AskResponse, TransactionFilters } from '@/lib/types';

const EXAMPLES = [
  'How much did I spend on groceries last month?',
  'My biggest expenses over $200',
  'Show me everything I earned in August',
  'Where does my money go — donut chart',
];

interface AskBarProps {
  /**
   * Applies the filters the model derived to the page's filter controls.
   * Optional: on the dashboard the answer and its chart are the whole point,
   * and there are no filter controls to drive.
   */
  onFilters?: (filters: TransactionFilters) => void;
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
      onFilters?.(askFiltersToUiFilters(response.filters));
      setAnswer(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      aria-busy={loading}
      className={cn(
        'relative overflow-hidden rounded-xl border bg-card p-4 shadow-sm',
        'transition-[border-color,box-shadow] duration-300',
        loading && 'border-primary/40',
      )}
    >
      {/* The model call has no measurable progress, so this reports "still
          working" rather than inventing a percentage. */}
      {loading ? (
        <span
          aria-hidden
          className="bg-primary absolute inset-x-0 top-0 h-0.5 origin-left animate-indeterminate"
        />
      ) : null}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit(question);
        }}
        className="flex flex-col gap-2 sm:flex-row"
      >
        <div className="relative flex-1">
          <Sparkles
            className={cn(
              'pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2',
              'transition-[color,transform] duration-300',
              loading ? 'text-primary scale-110' : 'text-muted-foreground',
            )}
          />
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
          {EXAMPLES.map((example, index) => (
            <button
              key={example}
              type="button"
              onClick={() => {
                setQuestion(example);
                void submit(example);
              }}
              disabled={loading}
              style={{ animationDelay: `${index * 50}ms` }}
              className={cn(
                'animate-enter rounded-full border px-3 py-1 text-xs text-muted-foreground',
                'transition-[color,background-color,border-color,transform] duration-200',
                'hover:bg-accent hover:text-foreground hover:-translate-y-0.5',
                'active:scale-95 disabled:opacity-50',
              )}
            >
              {example}
            </button>
          ))}
        </div>
      ) : null}

      {answer ? (
        <div className="animate-enter mt-4 space-y-3">
          <p className="text-sm text-muted-foreground">{answer.headline}</p>
          <WalletChart
            type={answer.chart.type}
            data={answer.chart.data}
            typeFilter={answer.filters.type}
          />
        </div>
      ) : null}
      {error ? <p className="animate-enter mt-3 text-sm text-[var(--expense)]">{error}</p> : null}
    </div>
  );
}
