import { EventEmitter2 } from '@nestjs/event-emitter';
import { SseService } from '../sse.service';

jest.mock('ioredis', () => ({ default: jest.fn(), __esModule: true }));

const MockRedis = jest.requireMock<{ default: jest.Mock }>('ioredis').default;

function makeMockRedis() {
  return {
    connect: jest.fn().mockResolvedValue(undefined),
    publish: jest.fn().mockResolvedValue(1),
    subscribe: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
    quit: jest.fn().mockResolvedValue('OK'),
  };
}

async function makeInitialisedService() {
  const pubMock = makeMockRedis();
  const subMock = makeMockRedis();

  MockRedis.mockImplementationOnce(() => pubMock);
  MockRedis.mockImplementationOnce(() => subMock);

  const emitter = new EventEmitter2();
  const service = new SseService(emitter);
  await service.onModuleInit();

  return { service, emitter, pubMock, subMock };
}

describe('SseService — Redis bridge', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('onModuleInit()', () => {
    it('creates two ioredis clients and subscribes the second to the SSE channel', async () => {
      const { subMock } = await makeInitialisedService();

      expect(MockRedis).toHaveBeenCalledTimes(2);
      expect(subMock.subscribe).toHaveBeenCalledWith('scheduler:sse:events');
    });

    it('attaches the message listener before connecting', async () => {
      const pubMock = makeMockRedis();
      const subMock = makeMockRedis();

      const callOrder: string[] = [];
      subMock.on = jest.fn().mockImplementation(() => callOrder.push('on'));
      subMock.connect = jest.fn().mockImplementation(async () => callOrder.push('connect'));

      MockRedis.mockImplementationOnce(() => pubMock);
      MockRedis.mockImplementationOnce(() => subMock);

      const service = new SseService(new EventEmitter2());
      await service.onModuleInit();

      expect(callOrder[0]).toBe('on');
      expect(callOrder[1]).toBe('connect');
    });
  });

  describe('emit()', () => {
    it('publishes a JSON-serialised payload to the SSE Redis channel', async () => {
      const { service, pubMock } = await makeInitialisedService();

      service.emit('job_started', { id: '42', status: 'processing' });
      await Promise.resolve();

      expect(pubMock.publish).toHaveBeenCalledWith(
        'scheduler:sse:events',
        JSON.stringify({ event: 'job_started', data: { id: '42', status: 'processing' } }),
      );
    });

    it('falls back to local EventEmitter2 when publish rejects', async () => {
      const { service, emitter, pubMock } = await makeInitialisedService();
      pubMock.publish = jest.fn().mockRejectedValue(new Error('Redis down'));

      const received: unknown[] = [];
      emitter.on('job_event', (payload) => received.push(payload));

      service.emit('job_failed', { id: '1', status: 'failed' });
      await new Promise((r) => setImmediate(r));

      expect(received).toEqual([{ event: 'job_failed', data: { id: '1', status: 'failed' } }]);
    });
  });

  describe('subscriber message handler', () => {
    it('re-emits parsed Redis messages into the local EventEmitter2', async () => {
      const { emitter, subMock } = await makeInitialisedService();

      const messageHandler = (subMock.on as jest.Mock).mock.calls.find(
        ([evt]: [string]) => evt === 'message',
      )?.[1] as (channel: string, raw: string) => void;

      const received: unknown[] = [];
      emitter.on('job_event', (payload) => received.push(payload));

      messageHandler(
        'scheduler:sse:events',
        JSON.stringify({ event: 'job_completed', data: { id: '7', status: 'completed' } }),
      );

      expect(received).toEqual([
        { event: 'job_completed', data: { id: '7', status: 'completed' } },
      ]);
    });

    it('does not throw on malformed JSON', async () => {
      const { subMock } = await makeInitialisedService();

      const messageHandler = (subMock.on as jest.Mock).mock.calls.find(
        ([evt]: [string]) => evt === 'message',
      )?.[1] as (channel: string, raw: string) => void;

      expect(() => messageHandler('scheduler:sse:events', 'not-json')).not.toThrow();
    });
  });

  describe('onModuleDestroy()', () => {
    it('quits both Redis clients', async () => {
      const { service, pubMock, subMock } = await makeInitialisedService();
      await service.onModuleDestroy();

      expect(pubMock.quit).toHaveBeenCalledTimes(1);
      expect(subMock.quit).toHaveBeenCalledTimes(1);
    });
  });
});
