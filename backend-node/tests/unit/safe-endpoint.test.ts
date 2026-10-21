import { safeEndpoint, safeFormEndpoint, ALLOWED_TEST_HOSTS } from '../../scripts/safe-endpoint';

describe('Safe Endpoint & URL Traversal Security (SonarQube typescript:S5147 / S5144)', () => {
  const BASE_URL = 'http://127.0.0.1:3001/api';

  describe('Allowed & Rejected Hosts', () => {
    test('allows legitimate local test hosts', () => {
      const url1 = safeEndpoint('http://127.0.0.1:3001/api', 'users');
      expect(url1).toBe('http://127.0.0.1:3001/api/users');

      const url2 = safeEndpoint('http://localhost:3001/api', 'projects', 'p1');
      expect(url2).toBe('http://localhost:3001/api/projects/p1');
    });

    test('rejects external or unauthorized target hosts', () => {
      expect(() => safeEndpoint('http://evil.com/api', 'users')).toThrow(
        /Rejected unauthorized destination host/
      );
      expect(() => safeEndpoint('http://169.254.169.254/latest/meta-data', 'ami-id')).toThrow(
        /Rejected unauthorized destination host/
      );
    });

    test('rejects unsafe protocols', () => {
      expect(() => safeEndpoint('ftp://127.0.0.1:3001/api', 'users')).toThrow(
        /Rejected unsafe protocol/
      );
      expect(() => safeEndpoint('file:///127.0.0.1/api', 'users')).toThrow(
        /Rejected unsafe protocol/
      );
      expect(() => safeEndpoint('javascript:alert(1)', 'users')).toThrow(
        /Rejected unsafe protocol/
      );
    });

    test('rejects embedded credentials in URL', () => {
      expect(() => safeEndpoint('http://admin:secret@127.0.0.1:3001/api', 'users')).toThrow(
        /Rejected embedded credentials/
      );
    });
  });

  describe('Segment Validation & SSRF / Traversal Defense', () => {
    test('rejects empty or whitespace-only segments', () => {
      expect(() => safeEndpoint(BASE_URL, '')).toThrow(/Empty path segment rejected/);
      expect(() => safeEndpoint(BASE_URL, '   ')).toThrow(/Empty path segment rejected/);
    });

    test('rejects path traversal attempts (relative dot-dot and encoded)', () => {
      expect(() => safeEndpoint(BASE_URL, '..')).toThrow(/Potential SSRF or path traversal/);
      expect(() => safeEndpoint(BASE_URL, '../admin')).toThrow(/Potential SSRF or path traversal/);
      expect(() => safeEndpoint(BASE_URL, '%2e%2e')).toThrow(/Potential SSRF or path traversal/);
      expect(() => safeEndpoint(BASE_URL, '..%2fadmin')).toThrow(/Potential SSRF or path traversal/);
    });

    test('rejects path separators in single segment', () => {
      expect(() => safeEndpoint(BASE_URL, 'users/delete')).toThrow(/Potential SSRF or path traversal/);
      expect(() => safeEndpoint(BASE_URL, 'users\\delete')).toThrow(/Potential SSRF or path traversal/);
      expect(() => safeEndpoint(BASE_URL, 'users%2fdelete')).toThrow(/Potential SSRF or path traversal/);
      expect(() => safeEndpoint(BASE_URL, 'users%5cdelete')).toThrow(/Potential SSRF or path traversal/);
    });

    test('rejects query and fragment injection in segments', () => {
      expect(() => safeEndpoint(BASE_URL, 'users?admin=true')).toThrow(/Potential SSRF or path traversal/);
      expect(() => safeEndpoint(BASE_URL, 'users#token')).toThrow(/Potential SSRF or path traversal/);
    });

    test('rejects embedded scheme prefixes in segments', () => {
      expect(() => safeEndpoint(BASE_URL, 'http://external.com')).toThrow(/Potential SSRF or path traversal/);
      expect(() => safeEndpoint(BASE_URL, 'data:text/html')).toThrow(/Potential SSRF or path traversal/);
    });

    test('rejects disallowed characters in segments', () => {
      expect(() => safeEndpoint(BASE_URL, 'users<script>')).toThrow(/Segment contains disallowed characters/);
      expect(() => safeEndpoint(BASE_URL, 'users"OR"1"="1')).toThrow(/Segment contains disallowed characters/);
    });

    test('constructs valid normalized paths with multiple safe segments', () => {
      const url = safeEndpoint(BASE_URL, 'organizations', 'org-123_abc', 'details');
      expect(url).toBe('http://127.0.0.1:3001/api/organizations/org-123_abc/details');
    });

    test('safeFormEndpoint constructs correct form subresource URLs', () => {
      const formUrl = safeFormEndpoint(BASE_URL, 'form-99', 'submissions/my');
      expect(formUrl).toBe('http://127.0.0.1:3001/api/forms/form-99/submissions/my');

      const baseFormUrl = safeFormEndpoint(BASE_URL, 'form-99');
      expect(baseFormUrl).toBe('http://127.0.0.1:3001/api/forms/form-99');
    });
  });
});

