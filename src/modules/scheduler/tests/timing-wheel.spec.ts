import { TimingWheel, WHEEL_SIZE, type TimingWheelEntry } from '../timing-wheel';

function entry(id: string): TimingWheelEntry {
  return { jobId: id };
}

describe('TimingWheel', () => {
  const NOW = 1_000_000;

  describe('insert and tick', () => {
    it('entry with delay 1000ms (1 slot) fires on the next tick', () => {
      const wheel = new TimingWheel(NOW);
      const e = entry('job-1');
      wheel.insert(e, 1000); // 1 slot = fires after exactly one tick

      const fired = wheel.tick(NOW + 1000);
      expect(fired).toContain(e);
    });

    it('entry with delay 0 sits in the current slot and fires after a full revolution', () => {
      const wheel = new TimingWheel(NOW);
      const e = entry('job-0');
      wheel.insert(e, 0); // placed at currentSlot (slot 0)

      // Should not fire on the first tick (slot 1)
      expect(wheel.tick(NOW + 1000)).not.toContain(e);

      // Should fire after a full revolution when slot 0 comes back around
      let fired = false;
      for (let t = 2; t <= WHEEL_SIZE; t++) {
        const result = wheel.tick(NOW + t * 1000);
        if (result.includes(e)) {
          fired = true;
          break;
        }
      }
      expect(fired).toBe(true);
    });

    it('entry with delay N fires exactly N ticks later', () => {
      const wheel = new TimingWheel(NOW);
      const e = entry('job-2');
      wheel.insert(e, 5000); // 5 slots

      for (let t = 1; t <= 4; t++) {
        expect(wheel.tick(NOW + t * 1000)).not.toContain(e);
      }
      expect(wheel.tick(NOW + 5000)).toContain(e);
    });

    it('tick clears the slot — second tick at same position returns empty', () => {
      const wheel = new TimingWheel(NOW);
      wheel.insert(entry('job-3'), 0);
      wheel.tick(NOW + 1000); // fires and clears slot 1

      // Advance a full revolution so slot 1 comes around again
      for (let t = 2; t <= WHEEL_SIZE; t++) wheel.tick(NOW + t * 1000);

      expect(wheel.tick(NOW + (WHEEL_SIZE + 1) * 1000)).toHaveLength(0);
    });

    it('multiple entries in the same slot are all returned on that tick', () => {
      const wheel = new TimingWheel(NOW);
      const entries = [entry('a'), entry('b'), entry('c')];
      entries.forEach((e) => wheel.insert(e, 3000));

      wheel.tick(NOW + 1000);
      wheel.tick(NOW + 2000);
      const fired = wheel.tick(NOW + 3000);

      expect(fired).toHaveLength(3);
      entries.forEach((e) => expect(fired).toContain(e));
    });
  });

  describe('overflow bucket', () => {
    it('entry with delay >= WHEEL_SIZE goes to overflow, not the main wheel', () => {
      const wheel = new TimingWheel(NOW);
      const e = entry('overflow-job');
      wheel.insert(e, WHEEL_SIZE * 1000); // exactly at the boundary

      expect(wheel.overflowSize()).toBe(1);
      expect(wheel.size()).toBe(1);
    });

    it('overflow entry is promoted and eventually fires', () => {
      const wheel = new TimingWheel(NOW);
      const e = entry('overflow-job');
      const delayMs = (WHEEL_SIZE + 10) * 1000; // just over one revolution
      wheel.insert(e, delayMs);

      // Tick through one full revolution — the entry should be promoted into the wheel
      let fired = false;
      for (let t = 1; t <= WHEEL_SIZE + 20; t++) {
        const result = wheel.tick(NOW + t * 1000);
        if (result.includes(e)) {
          fired = true;
          break;
        }
      }

      expect(fired).toBe(true);
    });
  });

  describe('size()', () => {
    it('reflects entries in wheel and overflow combined', () => {
      const wheel = new TimingWheel(NOW);
      wheel.insert(entry('in-wheel'), 10_000);
      wheel.insert(entry('in-overflow'), WHEEL_SIZE * 1000 + 1);

      expect(wheel.size()).toBe(2);
    });

    it('decrements as entries fire', () => {
      const wheel = new TimingWheel(NOW);
      wheel.insert(entry('j1'), 1000);
      wheel.insert(entry('j2'), 2000);
      expect(wheel.size()).toBe(2);

      wheel.tick(NOW + 1000);
      expect(wheel.size()).toBe(1);

      wheel.tick(NOW + 2000);
      expect(wheel.size()).toBe(0);
    });
  });
});
