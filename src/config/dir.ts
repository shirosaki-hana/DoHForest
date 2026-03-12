import { fileURLToPath } from 'url';
import path from 'path';
//------------------------------------------------------------------------------//
const __filename: string = fileURLToPath(import.meta.url);
export const __dirname: string = path.dirname(__filename);

const isInSrc = __dirname.includes(path.sep + 'src' + path.sep) || __dirname.endsWith(path.sep + 'src');
export const projectRoot: string = isInSrc ? path.join(__dirname, '../../') : path.join(__dirname, '../');
