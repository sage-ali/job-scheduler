export function maskId(id: string | null | undefined, prefix: string = 'id'): string {
  if (!id) return `${prefix}_****`;

  const underscoreIndex = id.indexOf('_');
  if (underscoreIndex !== -1) {
    const detectedPrefix = id.slice(0, underscoreIndex);
    const rest = id.slice(underscoreIndex + 1);
    const last4 = rest.length >= 4 ? rest.slice(-4) : rest;
    return `${detectedPrefix}_****${last4}`;
  }

  if (id.length < 4) return `${prefix}_****`;
  return `${prefix}_****${id.slice(-4)}`;
}

export function maskEmail(email: string): string {
  if (!email) return 'unknown';

  const atIndex = email.indexOf('@');
  if (atIndex === -1) return 'invalid';

  const localPart = email.slice(0, atIndex);
  const domain = email.slice(atIndex + 1);

  if (!localPart || !domain) return 'invalid';

  const maskedLocal = localPart[0] + '****';
  return `${maskedLocal}@${domain}`;
}

export function maskSessionId(sessionId: string): string {
  return maskId(sessionId, 'sess');
}
