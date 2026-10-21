/**
 * MIRAI HTTP Client for Upstream Project Management System API
 * 
 * Features:
 * - Configurable base URL, bearer authentication, timeout, and retry policy
 * - Exponential backoff for transient failures (429, 5xx, network timeouts)
 * - Error mapping into specialized exception hierarchy
 * - Dependency injection for fetch (enabling isolated offline unit testing)
 */

import {
  MiraiAdapterError,
  UpstreamAuthError,
  UpstreamNetworkError,
  UpstreamNotFoundError,
  UpstreamRateLimitError,
  UpstreamTimeoutError,
} from './mirai-adapter.types';

export interface MiraiHttpClientConfig {
  baseUrl: string;
  token?: string;
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  fetchFn?: typeof fetch;
}

export class MiraiHttpClient {
  private readonly baseUrl: string;
  private readonly token?: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;
  private readonly fetchFn: typeof fetch;

  constructor(config: MiraiHttpClientConfig) {
    if (!config.baseUrl) {
      throw new MiraiAdapterError('baseUrl is required for MiraiHttpClient', 'CONFIG_ERROR', 500);
    }
    // Normalize baseUrl to remove trailing slash
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.token = config.token;
    this.timeoutMs = config.timeoutMs ?? 8000;
    this.maxRetries = config.maxRetries ?? 3;
    this.retryDelayMs = config.retryDelayMs ?? 300;
    this.fetchFn = config.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  /**
   * Helper delay utility for exponential backoff
   */
  private async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Check if an HTTP status or error qualifies for a retry
   */
  private isRetryable(status?: number, error?: any): boolean {
    if (status) {
      return status === 429 || status >= 500;
    }
    if (error) {
      const msg = String(error.message || '').toLowerCase();
      const name = String(error.name || '').toLowerCase();
      return (
        name.includes('timeout') ||
        name.includes('abort') ||
        msg.includes('network') ||
        msg.includes('fetch failed') ||
        msg.includes('econnrefused') ||
        msg.includes('etimedout')
      );
    }
    return false;
  }

  /**
   * Builds the full URL with query parameters
   */
  private buildUrl(endpoint: string, params?: Record<string, any>): string {
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = new URL(`${this.baseUrl}${cleanEndpoint}`);

    if (params) {
      Object.entries(params).forEach(([key, val]) => {
        if (val !== undefined && val !== null && val !== '') {
          url.searchParams.append(key, String(val));
        }
      });
    }

    return url.toString();
  }

  /**
   * Executes an HTTP GET request with retry logic and error normalization
   */
  async get<T>(endpoint: string, params?: Record<string, any>): Promise<T> {
    const url = this.buildUrl(endpoint, params);
    let attempt = 0;
    let lastError: any = null;

    while (attempt <= this.maxRetries) {
      attempt++;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      const headers: Record<string, string> = {
        'Accept': 'application/json',
      };
      if (this.token) {
        headers['Authorization'] = `Bearer ${this.token}`;
      }

      try {
        const response = await this.fetchFn(url, {
          method: 'GET',
          headers,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          const contentType = response.headers?.get?.('content-type') || '';
          if (contentType.includes('application/json')) {
            return (await response.json()) as T;
          }
          return (await response.text()) as unknown as T;
        }

        // Non-2xx response handling
        const status = response.status;
        let responseBody: any = null;
        try {
          responseBody = await response.json();
        } catch {
          try {
            responseBody = await response.text();
          } catch {
            responseBody = null;
          }
        }

        const errorMessage = responseBody?.error || responseBody?.message || `Upstream returned status ${status}`;

        // Map status codes to specific errors
        if (status === 401 || status === 403) {
          throw new UpstreamAuthError(errorMessage, status, { endpoint, status, response: responseBody });
        }

        if (status === 404) {
          throw new UpstreamNotFoundError(errorMessage, { endpoint, status, response: responseBody });
        }

        if (status === 429) {
          const retryAfter = Number(response.headers?.get?.('retry-after')) || undefined;
          lastError = new UpstreamRateLimitError(errorMessage, retryAfter, { endpoint, status, response: responseBody });
          if (attempt <= this.maxRetries) {
            const backoff = (retryAfter ? retryAfter * 1000 : this.retryDelayMs * Math.pow(2, attempt - 1));
            await this.delay(backoff);
            continue;
          }
          throw lastError;
        }

        if (status >= 500) {
          lastError = new UpstreamNetworkError(`Upstream server error: ${errorMessage}`, { endpoint, status, response: responseBody });
          if (attempt <= this.maxRetries) {
            await this.delay(this.retryDelayMs * Math.pow(2, attempt - 1));
            continue;
          }
          throw lastError;
        }

        // Unhandled 4xx client errors (e.g. 400 Bad Request)
        throw new MiraiAdapterError(errorMessage, 'UPSTREAM_CLIENT_ERROR', status, { endpoint, response: responseBody });
      } catch (err: any) {
        clearTimeout(timeoutId);

        if (err instanceof MiraiAdapterError) {
          if (!this.isRetryable(err.statusCode) || attempt > this.maxRetries) {
            throw err;
          }
          lastError = err;
        } else if (err.name === 'AbortError' || err.name === 'TimeoutError') {
          lastError = new UpstreamTimeoutError(`Request timed out after ${this.timeoutMs}ms for ${endpoint}`, { endpoint });
          if (attempt > this.maxRetries) {
            throw lastError;
          }
        } else {
          lastError = new UpstreamNetworkError(err.message || 'Connection failed to upstream API', { endpoint, originalError: err });
          if (attempt > this.maxRetries) {
            throw lastError;
          }
        }

        // Apply exponential backoff delay before next retry
        await this.delay(this.retryDelayMs * Math.pow(2, attempt - 1));
      }
    }

    throw lastError || new UpstreamNetworkError('Exceeded maximum retry attempts');
  }
}

