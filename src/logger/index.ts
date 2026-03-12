import { logStore } from './store.js';
import type { LogCategory } from './types.js';
//------------------------------------------------------------------------------//

export { logStore } from './store.js';

export const logger = {
  error: (category: LogCategory, message: string, meta?: unknown) => logStore.push('ERROR', category, message, meta),
  warn: (category: LogCategory, message: string, meta?: unknown) => logStore.push('WARN', category, message, meta),
  info: (category: LogCategory, message: string, meta?: unknown) => logStore.push('INFO', category, message, meta),
  debug: (category: LogCategory, message: string, meta?: unknown) => logStore.push('DEBUG', category, message, meta),
};
