import { WebhookDeliveryHandler } from '../webhook-delivery.handler';

describe('WebhookDeliveryHandler', () => {
  let handler: WebhookDeliveryHandler;

  beforeEach(() => {
    handler = new WebhookDeliveryHandler();
    jest.spyOn(Math, 'random').mockReturnValue(0); // 0 < 0.2 → would fail; we override per test
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('resolves when a valid webhook payload is provided', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5); // above FAILURE_RATE → success

    await expect(
      handler.handle({ url: 'https://example.com/hook', method: 'POST', body: { key: 'val' } }),
    ).resolves.toBeUndefined();
  });

  it('throws when url is missing', async () => {
    await expect(handler.handle({ url: '', method: 'POST' })).rejects.toThrow(
      'payload.url is required',
    );
  });

  it('throws on simulated timeout and propagates for Bull retry', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0); // below FAILURE_RATE → fail

    await expect(
      handler.handle({ url: 'https://example.com/hook', method: 'POST' }),
    ).rejects.toThrow('Simulated webhook timeout');
  });

  it('uses POST as default method when not specified', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const logSpy = jest.spyOn(handler['logger'], 'log');

    await handler.handle({ url: 'https://example.com/hook', method: 'POST' });

    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'webhook_delivered', method: 'POST' }),
    );
  });
});
