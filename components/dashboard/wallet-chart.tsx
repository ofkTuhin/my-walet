'use client';

import { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { formatCurrency } from '@/lib/utils';
import type { ChartBucket, ChartData, ChartType } from '@/lib/types';

/**
 * Renders whichever chart the question asked for.
 *
 * Rules held here regardless of chart type: a legend whenever two series are
 * drawn (identity is never carried by colour alone — the income/expense pair
 * sits in the CVD floor band), a hover tooltip on every mark, a table view
 * always reachable, and categorical hues assigned in fixed order and never
 * cycled — a ninth category folds into "Other" rather than reusing slot 1.
 */

const CATEGORICAL = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-6)',
  'var(--chart-7)',
  'var(--chart-8)',
] as const;

const MAX_SLICES = 8;


/**
 * Selective direct labels: only slices with enough angular room get one, and
 * the text wears an ink token rather than the slice colour. Small slices are
 * identified by the legend and the tooltip instead — labelling every slice is
 * what produces the collided pile-up on a long tail of categories.
 */
const MIN_LABELLED_SHARE = 0.08;

function sliceLabel(props: {
  name?: string;
  percent?: number;
  cx?: number;
  cy?: number;
  midAngle?: number;
  outerRadius?: number;
}) {
  const { name, percent = 0, cx = 0, cy = 0, midAngle = 0, outerRadius = 0 } = props;
  if (percent < MIN_LABELLED_SHARE || !name) return null;

  const radians = -midAngle * (Math.PI / 180);
  const radius = outerRadius + 22;
  const x = cx + radius * Math.cos(radians);
  const y = cy + radius * Math.sin(radians);

  return (
    <text
      x={x}
      y={y}
      fill="var(--muted-foreground)"
      fontSize={12}
      textAnchor={x > cx ? 'start' : 'end'}
      dominantBaseline="central"
    >
      {name} {Math.round(percent * 100)}%
    </text>
  );
}

const axisStyle = { fill: 'var(--chart-axis)', fontSize: 12 } as const;

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-sm shadow-md">
      {label ? <p className="mb-1 font-medium text-foreground">{label}</p> : null}
      {payload.map((entry) => (
        <p key={entry.name} className="flex items-center gap-2 text-muted-foreground">
          <span
            aria-hidden
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: entry.color }}
          />
          <span>{entry.name}</span>
          <span className="ml-auto font-medium text-foreground">
            {formatCurrency(entry.value ?? 0)}
          </span>
        </p>
      ))}
    </div>
  );
}

/** Beyond eight slices, the tail becomes a single "Other" rather than a new hue. */
function foldTail(buckets: ChartBucket[]): ChartBucket[] {
  if (buckets.length <= MAX_SLICES) return buckets;
  const head = buckets.slice(0, MAX_SLICES - 1);
  const tail = buckets.slice(MAX_SLICES - 1);
  return [
    ...head,
    {
      key: '__other__',
      label: `Other (${tail.length})`,
      income: tail.reduce((sum, b) => sum + b.income, 0),
      expense: tail.reduce((sum, b) => sum + b.expense, 0),
      total: tail.reduce((sum, b) => sum + b.total, 0),
      value: tail.reduce((sum, b) => sum + b.value, 0),
      count: tail.reduce((sum, b) => sum + b.count, 0),
    },
  ];
}

function DataTable({ buckets }: { buckets: ChartBucket[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="py-2 pr-4 font-medium">Bucket</th>
            <th className="py-2 pr-4 text-right font-medium">Income</th>
            <th className="py-2 pr-4 text-right font-medium">Expense</th>
            <th className="py-2 text-right font-medium">Count</th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((bucket) => (
            <tr key={bucket.key} className="border-b last:border-0">
              <td className="py-2 pr-4 text-foreground">{bucket.label}</td>
              <td className="py-2 pr-4 text-right tabular-nums">
                {bucket.income ? formatCurrency(bucket.income) : '—'}
              </td>
              <td className="py-2 pr-4 text-right tabular-nums">
                {bucket.expense ? formatCurrency(bucket.expense) : '—'}
              </td>
              <td className="py-2 text-right tabular-nums text-muted-foreground">{bucket.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface WalletChartProps {
  type: ChartType;
  data: ChartData;
  /** Set when the search was restricted to one side of the ledger. */
  typeFilter?: 'INCOME' | 'EXPENSE';
}

export function WalletChart({ type, data, typeFilter }: WalletChartProps) {
  const [showTable, setShowTable] = useState(type === 'table');

  const buckets = useMemo(
    () => (type === 'pie' || type === 'donut' ? foldTail(data.buckets) : data.buckets),
    [data.buckets, type],
  );

  if (!buckets.length) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Nothing to chart for that search.
      </p>
    );
  }

  // Two series only when the search spans both sides of the ledger.
  const bothSeries = !typeFilter;
  const singleKey = typeFilter === 'INCOME' ? 'income' : 'expense';
  const singleColor = typeFilter === 'INCOME' ? 'var(--chart-income)' : 'var(--chart-expense)';

  const showingTable = showTable || type === 'table';

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {data.truncated ? 'Showing the first 5,000 matching transactions. ' : null}
          {buckets.length} {data.groupBy === 'category' ? 'categories' : 'periods'}
        </p>
        {type !== 'table' ? (
          <button
            type="button"
            onClick={() => setShowTable((value) => !value)}
            className="rounded-md border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {showingTable ? 'Show chart' : 'Show table'}
          </button>
        ) : null}
      </div>

      {showingTable ? (
        <DataTable buckets={buckets} />
      ) : (
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            {type === 'pie' || type === 'donut' ? (
              <PieChart>
                <Tooltip content={<ChartTooltip />} />
                <Legend verticalAlign="bottom" height={36} iconType="circle" formatter={(value: string) => (
                    <span className="text-sm text-muted-foreground">{value}</span>
                  )} />
                <Pie
                  isAnimationActive={false}
                  data={buckets}
                  dataKey="value"
                  nameKey="label"
                  cx="50%"
                  cy="45%"
                  outerRadius={78}
                  innerRadius={type === 'donut' ? 48 : 0}
                  paddingAngle={2}
                  stroke="var(--card)"
                  strokeWidth={2}
                  label={sliceLabel}
                  labelLine={false}
                >
                  {buckets.map((bucket, index) => (
                    <Cell key={bucket.key} fill={CATEGORICAL[index % CATEGORICAL.length]} />
                  ))}
                </Pie>
              </PieChart>
            ) : type === 'line' ? (
              <LineChart data={buckets} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                <XAxis dataKey="label" tick={axisStyle} tickLine={false} axisLine={false} />
                <YAxis tick={axisStyle} tickLine={false} axisLine={false} width={64} />
                <Tooltip content={<ChartTooltip />} />
                {bothSeries ? <Legend iconType="circle" formatter={(value: string) => (
                    <span className="text-sm text-muted-foreground">{value}</span>
                  )} /> : null}
                {bothSeries ? (
                  <>
                    <Line isAnimationActive={false} type="monotone" dataKey="income" name="Income" stroke="var(--chart-income)" strokeWidth={2} dot={{ r: 4 }} />
                    <Line isAnimationActive={false} type="monotone" dataKey="expense" name="Expense" stroke="var(--chart-expense)" strokeWidth={2} dot={{ r: 4 }} />
                  </>
                ) : (
                  <Line isAnimationActive={false} type="monotone" dataKey={singleKey} name={typeFilter === 'INCOME' ? 'Income' : 'Expense'} stroke={singleColor} strokeWidth={2} dot={{ r: 4 }} />
                )}
              </LineChart>
            ) : type === 'area' ? (
              <AreaChart data={buckets} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                <XAxis dataKey="label" tick={axisStyle} tickLine={false} axisLine={false} />
                <YAxis tick={axisStyle} tickLine={false} axisLine={false} width={64} />
                <Tooltip content={<ChartTooltip />} />
                {bothSeries ? <Legend iconType="circle" formatter={(value: string) => (
                    <span className="text-sm text-muted-foreground">{value}</span>
                  )} /> : null}
                {bothSeries ? (
                  <>
                    <Area isAnimationActive={false} type="monotone" dataKey="income" name="Income" stroke="var(--chart-income)" fill="var(--chart-income)" fillOpacity={0.18} strokeWidth={2} />
                    <Area isAnimationActive={false} type="monotone" dataKey="expense" name="Expense" stroke="var(--chart-expense)" fill="var(--chart-expense)" fillOpacity={0.18} strokeWidth={2} />
                  </>
                ) : (
                  <Area isAnimationActive={false} type="monotone" dataKey={singleKey} name={typeFilter === 'INCOME' ? 'Income' : 'Expense'} stroke={singleColor} fill={singleColor} fillOpacity={0.18} strokeWidth={2} />
                )}
              </AreaChart>
            ) : (
              <BarChart data={buckets} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                <XAxis dataKey="label" tick={axisStyle} tickLine={false} axisLine={false} />
                <YAxis tick={axisStyle} tickLine={false} axisLine={false} width={64} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--chart-grid)', fillOpacity: 0.4 }} />
                {bothSeries ? <Legend iconType="circle" formatter={(value: string) => (
                    <span className="text-sm text-muted-foreground">{value}</span>
                  )} /> : null}
                {bothSeries ? (
                  <>
                    <Bar isAnimationActive={false} dataKey="income" name="Income" fill="var(--chart-income)" radius={[4, 4, 0, 0]} />
                    <Bar isAnimationActive={false} dataKey="expense" name="Expense" fill="var(--chart-expense)" radius={[4, 4, 0, 0]} />
                  </>
                ) : (
                  <Bar isAnimationActive={false} dataKey={singleKey} name={typeFilter === 'INCOME' ? 'Income' : 'Expense'} radius={[4, 4, 0, 0]}>
                    {/* Categories are distinct entities, so each gets its own fixed hue. */}
                    {buckets.map((bucket, index) => (
                      <Cell
                        key={bucket.key}
                        fill={
                          data.groupBy === 'category'
                            ? CATEGORICAL[index % CATEGORICAL.length]
                            : singleColor
                        }
                      />
                    ))}
                  </Bar>
                )}
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
