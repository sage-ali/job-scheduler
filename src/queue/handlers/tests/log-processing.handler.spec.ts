import { LogProcessingHandler } from '../log-processing.handler';

describe('LogProcessingHandler', () => {
  let handler: LogProcessingHandler;

  beforeEach(() => {
    handler = new LogProcessingHandler();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('resolves when a valid log payload is provided', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5); // above FAILURE_RATE → success

    await expect(
      handler.handle({ source: 'api-gateway', level: 'info', message: 'Request received' }),
    ).resolves.toBeUndefined();
  });

  it('throws when source is missing', async () => {
    await expect(handler.handle({ source: '', level: 'info', message: 'hello' })).rejects.toThrow(
      'payload.source and payload.message are required',
    );
  });

  it('throws when message is missing', async () => {
    await expect(handler.handle({ source: 'worker', level: 'error', message: '' })).rejects.toThrow(
      'payload.source and payload.message are required',
    );
  });

  it('throws on simulated ingest failure and propagates for Bull retry', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0); // below FAILURE_RATE → fail

    await expect(
      handler.handle({ source: 'worker', level: 'warn', message: 'high memory' }),
    ).rejects.toThrow('Simulated log ingest failure');
  });

  it('logs a structured log_processed event on success', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const logSpy = jest.spyOn(handler['logger'], 'log');

    await handler.handle({
      source: 'worker',
      level: 'info',
      message: 'job completed',
      metadata: { jobId: 'abc' },
    });

    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'log_processed',
        source: 'worker',
        level: 'info',
        lineCount: 1,
      }),
    );
  });
});
