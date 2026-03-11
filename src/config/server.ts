import path from 'path';
import { env } from './env.js';
import { projectRoot } from '../config/dir.js';

export const fastifyConfig = {
  bodyLimit: env.REQUEST_BODY_LIMIT,
  logger: false,
};

export const staticFilesConfig = {
  root: path.join(projectRoot, 'pages/'),
  prefix: '/',
  etag: true,
  lastModified: true,
};
