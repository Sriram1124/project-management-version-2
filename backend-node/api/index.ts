import app from '../src/app';
import { validateStartupConfig } from '../src/middleware/auth.middleware';

if (process.env.NODE_ENV !== 'test') {
  validateStartupConfig();
}

export default app;

