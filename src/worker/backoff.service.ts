import { Injectable } from '@nestjs/common';

// Delays: attempt 0 → ~1s, attempt 1 → ~5s, attempt 2 → ~25s
const BASE_MS = 1000;
const MULTIPLIER = 5;

@Injectable()
export class BackoffService {
  calculateWaitMs(attemptNumber: number): number {
    return BASE_MS * Math.pow(MULTIPLIER, attemptNumber);
  }

  applyJitter(waitMs: number): number {
    const jitter = Math.random() * 0.4 + 0.8; // [0.8, 1.2)
    return Math.round(waitMs * jitter);
  }

  nextRetryAt(attemptNumber: number): Date {
    const waitMs = this.applyJitter(this.calculateWaitMs(attemptNumber));
    return new Date(Date.now() + waitMs);
  }
}
