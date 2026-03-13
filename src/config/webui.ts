import path from 'path';
import { projectRoot } from '../config/dir.js';

export const fastifyConfig = {
  bodyLimit: 64 * 1024,
  logger: false,
};

export const staticFilesConfig = {
  root: path.join(projectRoot, 'webui/'),
  prefix: '/',
  etag: true,
  lastModified: true,
};
