import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { runBenchmark, type BenchmarkResult } from '../api/benchmark';

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

export function Benchmark() {
  const [n, setN] = useState(10000);
  const [result, setResult] = useState<BenchmarkResult | null>(null);

  const mutation = useMutation({
    mutationFn: runBenchmark,
    onSuccess: setResult,
  });

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold text-gray-900 mb-2">Algorithm Benchmark</h1>
      <p className="text-sm text-gray-500 mb-6">
        Compare Min-Heap vs Timing-Wheel insert and drain performance for N synthetic jobs.
      </p>

      <div className="rounded-lg border bg-white p-6 shadow-sm mb-6">
        <div className="flex items-end gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Number of jobs (N)
            </label>
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
            onClick={() => mutation.mutate(n)}
            disabled={mutation.isPending}
            className="rounded bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {mutation.isPending ? 'Running…' : 'Run Benchmark'}
          </button>
        </div>
      </div>

      {mutation.isError && (
        <p className="text-sm text-red-600 mb-4">Benchmark failed. Try a smaller N.</p>
      )}

      {result && (
        <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b bg-gray-50">
            <span className="text-sm font-medium text-gray-700">
              Results for N = {result.n.toLocaleString()}
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
                    <Ms value={result.heap.insertMs} />
                    <Winner winner={result.insertWinner} algo="heap" />
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <Ms value={result.wheel.insertMs} />
                    <Winner winner={result.insertWinner} algo="wheel" />
                  </div>
                </td>
              </tr>
              <tr>
                <td className="px-6 py-4 text-gray-600">Drain all N</td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <Ms value={result.heap.drainMs} />
                    <Winner winner={result.drainWinner} algo="heap" />
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <Ms value={result.wheel.drainMs} />
                    <Winner winner={result.drainWinner} algo="wheel" />
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
  );
}
