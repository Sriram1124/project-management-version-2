export interface PostmanHeader {
  key: string;
  value: string;
  description?: string;
  disabled?: boolean;
}

export interface PostmanQuery {
  key: string;
  value: string;
  description?: string;
  disabled?: boolean;
}

export interface PostmanUrl {
  raw: string;
  host: string[];
  path: string[];
  query?: PostmanQuery[];
}

export interface PostmanEvent {
  listen: 'test' | 'prerequest';
  script: {
    type: 'text/javascript';
    exec: string[];
  };
}

export function makeUrl(endpointPath: string, query?: PostmanQuery[]): PostmanUrl {
  const cleanPath = endpointPath.replace(/^\//, '');
  const segments = cleanPath.split('/').map((s) => (s.startsWith(':') ? `{{${s.slice(1)}}}` : s));
  const rawQuery = query && query.length > 0 ? '?' + query.map((q) => `${q.key}=${q.value}`).join('&') : '';
  return {
    raw: `{{baseUrl}}/${segments.join('/')}${rawQuery}`,
    host: ['{{baseUrl}}'],
    path: segments,
    query: query || [],
  };
}

export const jsonHeader: PostmanHeader = { key: 'Content-Type', value: 'application/json' };
export const acceptHeader: PostmanHeader = { key: 'Accept', value: 'application/json' };

export const bearerAuth = (tokenVar = 'accessToken') => ({
  type: 'bearer',
  bearer: [{ key: 'token', value: `{{${tokenVar}}}`, type: 'string' }],
});

export const noAuth = { type: 'noauth' };

export function testScript(lines: string[]): PostmanEvent {
  return {
    listen: 'test',
    script: {
      type: 'text/javascript',
      exec: lines,
    },
  };
}

export function prerequestScript(lines: string[]): PostmanEvent {
  return {
    listen: 'prerequest',
    script: {
      type: 'text/javascript',
      exec: lines,
    },
  };
}

