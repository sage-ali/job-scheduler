import { BackoffService } from './backoff.service';

describe('BackoffService', () => {
  let service: BackoffService;

  beforeEach(() => {
    service = new BackoffService();
  });

  describe('calculateWaitMs', () => {
    it('returns 1000ms at attempt 0 (first failure)', () => {
      expect(service.calculateWaitMs(0)).toBe(1000);
    });

    it('returns 5000ms at attempt 1', () => {
      expect(service.calculateWaitMs(1)).toBe(5000);
    });

    it('returns 25000ms at attempt 2', () => {
      expect(service.calculateWaitMs(2)).toBe(25000);
    });

    it('grows by 5x on each attempt', () => {
      const a0 = service.calculateWaitMs(0);
      const a1 = service.calculateWaitMs(1);
      const a2 = service.calculateWaitMs(2);
      expect(a1 / a0).toBe(5);
      expect(a2 / a1).toBe(5);
    });
  });

  describe('applyJitter', () => {
    it('keeps the result within ±20% of the input', () => {
      for (let i = 0; i < 200; i++) {
        const result = service.applyJitter(1000);
        expect(result).toBeGreaterThanOrEqual(800);
        expect(result).toBeLessThanOrEqual(1200);
      }
    });

    it('returns an integer', () => {
      for (let i = 0; i < 50; i++) {
        expect(Number.isInteger(service.applyJitter(1000))).toBe(true);
      }
    });
  });

  describe('nextRetryAt', () => {
    it('returns a Date in the future', () => {
      const before = Date.now();
      const date = service.nextRetryAt(0);
      expect(date.getTime()).toBeGreaterThan(before);
    });

    it('is offset by ~1s (jittered) at attempt 0', () => {
      const before = Date.now();
      const date = service.nextRetryAt(0); // base = 1000ms, jittered [800, 1200]
      const after = Date.now();
      expect(date.getTime()).toBeGreaterThanOrEqual(before + 800);
      expect(date.getTime()).toBeLessThanOrEqual(after + 1200);
    });

    it('produces a later date for higher attempt numbers', () => {
      // attempt 1 range [4000, 6000] is entirely above attempt 0 range [800, 1200]
      const date0 = service.nextRetryAt(0);
      const date1 = service.nextRetryAt(1);
      expect(date1.getTime()).toBeGreaterThan(date0.getTime());
    });
  });
});
