import { HeapPriorityQueue, type HeapNode } from '../heap';

function node(score: number, createdAt: Date, scheduledAt: Date | null = null): HeapNode {
  return { score, scheduledAt, createdAt, jobId: `job-${Math.random()}` };
}

describe('HeapPriorityQueue', () => {
  let heap: HeapPriorityQueue;

  beforeEach(() => {
    heap = new HeapPriorityQueue();
  });

  describe('empty heap', () => {
    it('popMin returns undefined', () => {
      expect(heap.popMin()).toBeUndefined();
    });

    it('peek returns undefined', () => {
      expect(heap.peek()).toBeUndefined();
    });

    it('size returns 0', () => {
      expect(heap.size()).toBe(0);
    });
  });

  describe('single element', () => {
    it('insert then popMin returns the same node', () => {
      const n = node(5, new Date());
      heap.insert(n);
      expect(heap.popMin()).toBe(n);
    });

    it('peek returns the node without removing it', () => {
      const n = node(5, new Date());
      heap.insert(n);
      expect(heap.peek()).toBe(n);
      expect(heap.size()).toBe(1);
    });
  });

  describe('ordering by score', () => {
    it('lower score pops first', () => {
      const now = new Date();
      heap.insert(node(3, now));
      heap.insert(node(1, now));
      heap.insert(node(2, now));

      expect(heap.popMin()!.score).toBe(1);
      expect(heap.popMin()!.score).toBe(2);
      expect(heap.popMin()!.score).toBe(3);
    });

    it('pops all elements in ascending score order', () => {
      const scores = [10, 3, 7, 1, 5, 9, 2];
      const now = new Date();
      scores.forEach((s) => heap.insert(node(s, now)));

      const popped: number[] = [];
      while (heap.size() > 0) popped.push(heap.popMin()!.score);

      expect(popped).toEqual([...scores].sort((a, b) => a - b));
    });
  });

  describe('tiebreak by scheduledAt', () => {
    it('earlier scheduledAt pops first when scores are equal', () => {
      const now = new Date();
      const later = new Date(now.getTime() + 60_000);
      const earlier = new Date(now.getTime() + 10_000);

      heap.insert(node(5, now, later));
      heap.insert(node(5, now, earlier));

      expect(heap.popMin()!.scheduledAt).toBe(earlier);
    });

    it('null scheduledAt (IMMEDIATE) beats any real timestamp', () => {
      const now = new Date();
      const future = new Date(now.getTime() + 1);

      heap.insert(node(5, now, future));
      heap.insert(node(5, now, null));

      expect(heap.popMin()!.scheduledAt).toBeNull();
    });
  });

  describe('tiebreak by createdAt', () => {
    it('earlier createdAt pops first when score and scheduledAt are equal', () => {
      const older = new Date('2026-01-01T00:00:00Z');
      const newer = new Date('2026-01-01T01:00:00Z');

      heap.insert(node(5, newer, null));
      heap.insert(node(5, older, null));

      expect(heap.popMin()!.createdAt).toBe(older);
    });
  });

  describe('heap property', () => {
    it('maintains min-heap invariant after 100 random inserts', () => {
      const base = Date.now();
      for (let i = 0; i < 100; i++) {
        heap.insert(node(Math.random() * 100, new Date(base + i)));
      }

      let prev = -Infinity;
      while (heap.size() > 0) {
        const current = heap.popMin()!.score;
        expect(current).toBeGreaterThanOrEqual(prev);
        prev = current;
      }
    });

    it('size decrements on every popMin', () => {
      for (let i = 0; i < 5; i++) heap.insert(node(i, new Date()));
      for (let i = 5; i > 0; i--) {
        expect(heap.size()).toBe(i);
        heap.popMin();
      }
      expect(heap.size()).toBe(0);
    });
  });
});
