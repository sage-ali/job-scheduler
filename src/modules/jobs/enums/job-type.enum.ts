export enum JobType {
  SEND_EMAIL = 'send_email',
  WEBHOOK_DELIVERY = 'webhook_delivery',
  LOG_PROCESSING = 'log_processing',
}

export enum RecurringInterval {
  EVERY_1_MINUTE = 'every_1_minute',
  EVERY_5_MINUTES = 'every_5_minutes',
  EVERY_1_HOUR = 'every_1_hour',
}

export const RECURRING_INTERVAL_MS: Record<RecurringInterval, number> = {
  [RecurringInterval.EVERY_1_MINUTE]: 60_000,
  [RecurringInterval.EVERY_5_MINUTES]: 5 * 60_000,
  [RecurringInterval.EVERY_1_HOUR]: 60 * 60_000,
};
