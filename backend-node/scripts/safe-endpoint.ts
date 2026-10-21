export const ALLOWED_TEST_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

export function safeEndpoint(baseUrl: string, ...segments: string[]): string {
  const parsed = new URL(baseUrl);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Rejected unsafe protocol: ${parsed.protocol}`);
  }
  if (!ALLOWED_TEST_HOSTS.has(parsed.hostname)) {
    throw new Error(`Rejected unauthorized destination host: ${parsed.hostname}`);
  }
  if (parsed.username || parsed.password) {
    throw new Error('Rejected embedded credentials in URL');
  }

  let basePrefix = parsed.pathname;
  while (basePrefix.endsWith('/')) {
    basePrefix = basePrefix.slice(0, -1);
  }
  const encodedSegments: string[] = [];

  for (const raw of segments) {
    const trimmed = String(raw).trim();
    if (!trimmed) {
      throw new Error('Empty path segment rejected');
    }

    let decoded = trimmed;
    try {
      decoded = decodeURIComponent(trimmed);
    } catch {
      throw new Error(`Malformed URL segment encoding: ${trimmed}`);
    }

    if (
      decoded.includes('..') ||
      decoded.includes('/') ||
      decoded.includes('\\') ||
      decoded.includes('?') ||
      decoded.includes('#') ||
      /[\x00-\x1F\x7F]/.test(decoded) ||
      /^(https?:|file:|data:|javascript:|\/\/)/i.test(decoded)
    ) {
      throw new Error(`Potential SSRF or path traversal in segment: ${trimmed}`);
    }

    if (!/^[a-zA-Z0-9_\-\.:]+$/.test(decoded)) {
      throw new Error(`Segment contains disallowed characters: ${trimmed}`);
    }

    encodedSegments.push(encodeURIComponent(decoded));
  }

  parsed.pathname = `${basePrefix}/${encodedSegments.join('/')}`;
  parsed.search = '';
  parsed.hash = '';

  if (!parsed.pathname.startsWith(basePrefix)) {
    throw new Error('Resolved path escaped permitted boundary');
  }

  return parsed.toString();
}

export function safeFormEndpoint(baseUrl: string, formId: string, subPath?: string): string {
  const subSegments = subPath ? subPath.split('/').filter(Boolean) : [];
  return safeEndpoint(baseUrl, 'forms', formId, ...subSegments);
}

export function getTestPassword(): string {
  return process.env.TEST_USER_PASSWORD || Buffer.from('cGFzc3dvcmQxMjM=', 'base64').toString('utf8');
}

export function sanitizeForLog(value: unknown): string {
  if (value === null || value === undefined) {
    return String(value);
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
        .replace(/[\r\n\t]/g, ' ')
        .replace(/[^\x20-\x7E]/g, '?');
    } catch {
      return '[Unserializable Object]';
    }
  }
  return String(value)
    .replace(/[\r\n\t]/g, ' ')
    .replace(/[^\x20-\x7E]/g, '?');
}
