import express from 'express';
import { Readable } from 'stream';

describe('Content Length & Body Limit Security (SonarQube javascript:S5689)', () => {
  const jsonParser = express.json({ limit: '2mb' });

  it('parses valid payload under 2mb', (done) => {
    const payload = JSON.stringify({ message: 'safe-content' });
    const req: any = Readable.from([payload]);
    req.headers = {
      'content-type': 'application/json',
      'content-length': String(Buffer.byteLength(payload)),
    };
    const res: any = {};

    jsonParser(req, res, (err?: any) => {
      expect(err).toBeUndefined();
      expect(req.body).toEqual({ message: 'safe-content' });
      done();
    });
  });

  it('rejects oversized payload exceeding 2mb with HTTP 413 entity.too.large', (done) => {
    const largeData = 'X'.repeat(2.5 * 1024 * 1024);
    const payload = JSON.stringify({ data: largeData });
    const req: any = Readable.from([payload]);
    req.headers = {
      'content-type': 'application/json',
      'content-length': String(Buffer.byteLength(payload)),
    };
    const res: any = {};

    jsonParser(req, res, (err?: any) => {
      expect(err).toBeDefined();
      expect(err.status).toBe(413);
      expect(err.type).toBe('entity.too.large');
      done();
    });
  });
});

