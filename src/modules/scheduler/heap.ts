export interface HeapNode {
  score: number;
  scheduledAt: Date | null;
  createdAt: Date;
  jobId: string;
}

// null scheduledAt means "run immediately" — -Infinity sorts it before any real timestamp,
// including new Date(0) which would collide if we used 0.
const IMMEDIATE = -Infinity;

function compareNodes(a: HeapNode, b: HeapNode): number {
  if (a.score !== b.score) return a.score - b.score;

  const aTime = a.scheduledAt?.getTime() ?? IMMEDIATE;
  const bTime = b.scheduledAt?.getTime() ?? IMMEDIATE;
  if (aTime !== bTime) return aTime - bTime;

  return a.createdAt.getTime() - b.createdAt.getTime();
}

export class HeapPriorityQueue {
  private readonly heap: HeapNode[] = [];

  insert(node: HeapNode): void {
    this.heap.push(node);
    this.bubbleUp(this.heap.length - 1);
  }

  popMin(): HeapNode | undefined {
    if (this.heap.length === 0) return undefined;

    if (this.heap.length === 1) return this.heap.pop();

    const min = this.heap[0];
    this.heap[0] = this.heap.pop()!;
    this.bubbleDown(0);
    return min;
  }

  peek(): HeapNode | undefined {
    return this.heap[0];
  }

  size(): number {
    return this.heap.length;
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (compareNodes(this.heap[parent], this.heap[index]) <= 0) break;
      [this.heap[parent], this.heap[index]] = [this.heap[index], this.heap[parent]];
      index = parent;
    }
  }

  private bubbleDown(index: number): void {
    const size = this.heap.length;
    while (true) {
      let smallest = index;
      const left = 2 * index + 1;
      const right = 2 * index + 2;

      if (left < size && compareNodes(this.heap[left], this.heap[smallest]) < 0) smallest = left;
      if (right < size && compareNodes(this.heap[right], this.heap[smallest]) < 0) smallest = right;

      if (smallest === index) break;
      [this.heap[smallest], this.heap[index]] = [this.heap[index], this.heap[smallest]];
      index = smallest;
    }
  }
}
