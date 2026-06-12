import client from './client';
import type { JobType } from './jobs';

export interface BenchmarkResult {
  n: number;
  heap: { insertMs: number; drainMs: number };
  wheel: { insertMs: number; drainMs: number };
  insertWinner: 'heap' | 'wheel';
  drainWinner: 'heap' | 'wheel';
}

export interface LatencyStats {
  min: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  avg: number;
}

export interface ThroughputResult {
  n: number;
  type: JobType;
  completed: number;
  failed: number;
  totalMs: number;
  createMs: number;
  throughputPerSec: number;
  queueWait: LatencyStats;
  processing: LatencyStats;
}

export async function runBenchmark(n: number): Promise<BenchmarkResult> {
  const res = await client.get<{ data: BenchmarkResult }>('/benchmark', { params: { n } });
  return res.data.data;
}

export async function runThroughputBenchmark(n: number, type: JobType): Promise<ThroughputResult> {
  const res = await client.post<{ data: ThroughputResult }>('/benchmark/throughput', { n, type }, { timeout: 180_000 });
  return res.data.data;
}
