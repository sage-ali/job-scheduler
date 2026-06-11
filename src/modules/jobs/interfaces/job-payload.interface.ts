// Payload shapes for each job type.
// The worker dispatcher uses these to validate the payload before passing
// it to the correct handler.

export interface SendEmailPayload {
  to: string;
  subject: string;
  body?: string;
}

export interface WebhookDeliveryPayload {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH';
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
}

export interface LogProcessingPayload {
  source: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  metadata?: Record<string, unknown>;
}

export type JobPayload = SendEmailPayload | WebhookDeliveryPayload | LogProcessingPayload;
