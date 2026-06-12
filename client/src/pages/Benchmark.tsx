import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { runBenchmark, runThroughputBenchmark, type BenchmarkResult, type ThroughputResult } from '../api/benchmark';
import type { JobType } from '../api/jobs';

function Winner({ winner, algo }: { winner: string; algo: string }) {
  return winner === algo ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
      winner
    </span>
  ) : null;
}

function Ms({ value }: { value: number }) {
  return <span className="font-mono">{value.toFixed(2)} ms</span>;
}

function fmt(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms}ms`;
}

function LatencyRow({ label, stats }: { label: string; stats: { min: number; p50: number; p95: number; p99: number; max: number; avg: number } }) {
  return (
    <tr className="border-t text-sm">
      <td className="px-4 py-3 text-gray-600 font-medium">{label}</td>
      <td className="px-4 py-3 font-mono text-gray-800">{fmt(stats.min)}</td>
      <td className="px-4 py-3 font-mono text-gray-800">{fmt(stats.p50)}</td>
      <td className="px-4 py-3 font-mono text-gray-800">{fmt(stats.p95)}</td>
      <td className="px-4 py-3 font-mono text-gray-800">{fmt(stats.p99)}</td>
      <td className="px-4 py-3 font-mono text-gray-800">{fmt(stats.max)}</td>
      <td className="px-4 py-3 font-mono text-gray-800">{fmt(stats.avg)}</td>
    </tr>
  );
}

export function Benchmark() {
  const [n, setN] = useState(10000);
  const [algoResult, setAlgoResult] = useState<BenchmarkResult | null>(null);

  const [throughputN, setThroughputN] = useState(30);
  const [throughputType, setThroughputType] = useState<JobType>('send_email');
  const [throughputResults, setThroughputResults] = useState<ThroughputResult[]>([]);

  const algoBenchMutation = useMutation({
    mutationFn: runBenchmark,
    onSuccess: setAlgoResult,
  });

  const throughputMutation = useMutation({
    mutationFn: ({ n, type }: { n: number; type: JobType }) => runThroughputBenchmark(n, type),
    onSuccess: (result) => setThroughputResults((prev) => [result, ...prev].slice(0, 5)),
  });

  return (
    <div className="max-w-3xl space-y-10">

      {/* ── Algorithm benchmark ─────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">Algorithm Benchmark</h1>
        <p className="text-sm text-gray-500 mb-6">
          Compare Min-Heap vs Timing-Wheel insert and drain performance for N synthetic jobs.
        </p>

        <div className="rounded-lg border bg-white p-6 shadow-sm mb-6">
          <div className="flex items-end gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Number of jobs (N)</label>
              <input
                type="number"
                min={100}
                max={100000}
                step={1000}
                value={n}
                onChange={(e) => setN(Math.min(100000, Math.max(100, Number(e.target.value))))}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
              <p className="mt-1 text-xs text-gray-400">Range: 100 – 100,000</p>
            </div>
            <button
              onClick={() => algoBenchMutation.mutate(n)}
              disabled={algoBenchMutation.isPending}
              className="rounded bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {algoBenchMutation.isPending ? 'Running…' : 'Run Benchmark'}
            </button>
          </div>
        </div>

        {algoBenchMutation.isError && (
          <p className="text-sm text-red-600 mb-4">Benchmark failed. Try a smaller N.</p>
        )}

        {algoResult && (
          <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b bg-gray-50">
              <span className="text-sm font-medium text-gray-700">
                Results for N = {algoResult.n.toLocaleString()}
              </span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-gray-500 uppercase tracking-wide">
                  <th className="px-6 py-3">Metric</th>
                  <th className="px-6 py-3">Min-Heap</th>
                  <th className="px-6 py-3">Timing Wheel</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <tr>
                  <td className="px-6 py-4 text-gray-600">Insert all N</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <Ms value={algoResult.heap.insertMs} />
                      <Winner winner={algoResult.insertWinner} algo="heap" />
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <Ms value={algoResult.wheel.insertMs} />
                      <Winner winner={algoResult.insertWinner} algo="wheel" />
                    </div>
                  </td>
                </tr>
                <tr>
                  <td className="px-6 py-4 text-gray-600">Drain all N</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <Ms value={algoResult.heap.drainMs} />
                      <Winner winner={algoResult.drainWinner} algo="heap" />
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <Ms value={algoResult.wheel.drainMs} />
                      <Winner winner={algoResult.drainWinner} algo="wheel" />
                    </div>
                  </td>
                </tr>
                <tr className="bg-gray-50">
                  <td className="px-6 py-4 text-gray-600">Insert complexity</td>
                  <td className="px-6 py-4 font-mono text-xs">O(log n)</td>
                  <td className="px-6 py-4 font-mono text-xs">O(1)</td>
                </tr>
                <tr className="bg-gray-50">
                  <td className="px-6 py-4 text-gray-600">Drain complexity</td>
                  <td className="px-6 py-4 font-mono text-xs">O(n log n)</td>
                  <td className="px-6 py-4 font-mono text-xs">O(slots + n)</td>
                </tr>
              </tbody>
            </table>
            <div className="px-6 py-4 border-t bg-gray-50 text-xs text-gray-500">
              Heap: priority-first ordering. Wheel: time-first, 3600 slots × 1 s, overflow bucket for delays &gt; 1 h.
            </div>
          </div>
        )}
      </div>

      {/* ── Throughput benchmark ─────────────────────────────────────────── */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Live Throughput Test</h2>
        <p className="text-sm text-gray-500 mb-6">
          Creates N real jobs (max_retries=0), waits for every job to reach a terminal state,
          then shows queue-wait and processing latency. Run multiple times to compare job types or counts.
        </p>

        <div className="rounded-lg border bg-white p-6 shadow-sm mb-6">
          <div className="flex items-end gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Jobs (N)</label>
              <select
                value={throughputN}
                onChange={(e) => setThroughputN(Number(e.target.value))}
                className="rounded border border-gray-300 px-3 py-2 text-sm"
              >
                <option value={30}>30</option>
                <option value={100}>100</option>
                <option value={200}>200</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Job type</label>
              <select
                value={throughputType}
                onChange={(e) => setThroughputType(e.target.value as JobType)}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="send_email">send_email (100–600ms, 15% fail)</option>
                <option value="webhook_delivery">webhook_delivery (50–400ms, 20% fail)</option>
                <option value="log_processing">log_processing (20–200ms, 10% fail)</option>
              </select>
            </div>
            <button
              onClick={() => throughputMutation.mutate({ n: throughputN, type: throughputType })}
              disabled={throughputMutation.isPending}
              className="rounded bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 whitespace-nowrap"
            >
              {throughputMutation.isPending ? 'Running…' : 'Run Test'}
            </button>
          </div>
          {throughputMutation.isPending && (
            <p className="mt-3 text-xs text-gray-400">
              Creating jobs and waiting for workers to process them — this may take up to 30s for N=200…
            </p>
          )}
          {throughputMutation.isError && (
            <p className="mt-3 text-sm text-red-600">Test failed. Make sure workers are running.</p>
          )}
        </div>

        {throughputResults.length > 0 && (
          <div className="space-y-4">
            {throughputResults.map((result, i) => (
              <div key={i} className="rounded-lg border bg-white shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b bg-gray-50 flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">
                    N={result.n} · {result.type}
                  </span>
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span>{result.completed} completed</span>
                    <span className="text-red-500">{result.failed} failed</span>
                    <span className="font-semibold text-gray-700">{result.throughputPerSec} jobs/sec</span>
                    <span>total {fmt(result.totalMs)}</span>
                  </div>
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b text-gray-500 uppercase tracking-wide">
                      <th className="px-4 py-2 text-left">Metric</th>
                      <th className="px-4 py-2 text-left">min</th>
                      <th className="px-4 py-2 text-left">p50</th>
                      <th className="px-4 py-2 text-left">p95</th>
                      <th className="px-4 py-2 text-left">p99</th>
                      <th className="px-4 py-2 text-left">max</th>
                      <th className="px-4 py-2 text-left">avg</th>
                    </tr>
                  </thead>
                  <tbody>
                    <LatencyRow label="Queue wait (created→started)" stats={result.queueWait} />
                    <LatencyRow label="Processing (started→completed)" stats={result.processing} />
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
