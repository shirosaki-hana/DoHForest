import path from 'path';
import { projectRoot } from '../config/dir.js';

export const fastifyConfig = {
  bodyLimit: 10 * 1024 * 1024,
  logger: false,
};

export const staticFilesConfig = {
  root: path.join(projectRoot, 'pages/'),
  prefix: '/',
  etag: true,
  lastModified: true,
};
