import path from 'node:path';
import {realpath} from 'node:fs/promises';
import {homedir} from 'node:os';

export function workspaceGrepScope(root) {
  const key = value => process.platform === 'win32' ? value.toLowerCase() : value;
  if (typeof root !== 'string' || !path.isAbsolute(root)) {
    throw new Error('An exact task workspace is required');
  }
  root = path.resolve(root);
  if (path.dirname(root) === root || key(root) === key(homedir())) {
    throw new Error('An exact task workspace is required');
  }
  const within = (file, base) => {
    const relative = path.relative(key(base), key(file));
    return relative === '' || relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
  };
  return async args => {
    if (args.path !== undefined && (typeof args.path !== 'string' || /[\0\r\n]/.test(args.path) || args.path.startsWith('~'))) {
      throw new Error('Invalid task search path');
    }
    const target = path.resolve(root, args.path || '.');
    if (!within(target, root)) throw new Error('Search outside the task workspace denied');
    const [actualRoot, actualTarget] = await Promise.all([realpath(root), realpath(target)]);
    if (!within(actualTarget, actualRoot)) throw new Error('Search path resolves outside the task workspace');
  };
}
