import client from './client';

export interface BenchmarkResult {
  n: number;
  heap: { insertMs: number; drainMs: number };
  wheel: { insertMs: number; drainMs: number };
  insertWinner: 'heap' | 'wheel';
  drainWinner: 'heap' | 'wheel';
}

export async function runBenchmark(n: number): Promise<BenchmarkResult> {
  const res = await client.get<{ data: BenchmarkResult }>('/benchmark', { params: { n } });
  return res.data.data;
}
