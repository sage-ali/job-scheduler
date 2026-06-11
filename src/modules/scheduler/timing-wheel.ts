export interface TimingWheelEntry {
  jobId: string;
}

export const WHEEL_SIZE = 3600; // 1 slot = 1 second → covers exactly 1 hour

export class TimingWheel {
  private readonly wheel: TimingWheelEntry[][] = Array.from({ length: WHEEL_SIZE }, () => []);
  private readonly overflow: Array<{ entry: TimingWheelEntry; targetMs: number }> = [];

  private currentSlot = 0;
  private lastTickMs: number;

  constructor(nowMs = Date.now()) {
    this.lastTickMs = nowMs;
  }

  insert(entry: TimingWheelEntry, delayMs: number): void {
    const delaySlots = Math.floor(Math.max(0, delayMs) / 1000);

    if (delaySlots >= WHEEL_SIZE) {
      // Delay exceeds one wheel revolution — park in overflow until the hand
      // comes close enough to re-insert into the wheel proper.
      this.overflow.push({ entry, targetMs: this.lastTickMs + delayMs });
      return;
    }

    const targetSlot = (this.currentSlot + delaySlots) % WHEEL_SIZE;
    this.wheel[targetSlot].push(entry);
  }

  tick(nowMs = Date.now()): TimingWheelEntry[] {
    this.currentSlot = (this.currentSlot + 1) % WHEEL_SIZE;
    this.lastTickMs = nowMs;

    const expired = this.wheel[this.currentSlot];
    this.wheel[this.currentSlot] = [];

    // Promote any overflow entries that are now within one wheel revolution.
    const stillOverflow: typeof this.overflow = [];
    for (const item of this.overflow) {
      const remainingMs = item.targetMs - nowMs;
      if (remainingMs < WHEEL_SIZE * 1000) {
        this.insert(item.entry, Math.max(0, remainingMs));
      } else {
        stillOverflow.push(item);
      }
    }
    this.overflow.splice(0, this.overflow.length, ...stillOverflow);

    return expired;
  }

  size(): number {
    return this.wheel.reduce((acc, slot) => acc + slot.length, 0) + this.overflow.length;
  }

  overflowSize(): number {
    return this.overflow.length;
  }
}
