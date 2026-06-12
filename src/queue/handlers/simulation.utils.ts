export function randomDelay(minMs: number, maxMs: number): Promise<void> {
  const ms = Math.floor(Math.random() * (maxMs - minMs) + minMs);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function shouldSimulateFail(failureRate: number): boolean {
  return Math.random() < failureRate;
}
