import path from 'node:path';
import {stat} from 'node:fs/promises';
import {homedir} from 'node:os';
import {boundedNativeGrep} from './native-grep.mjs';

export async function resolveNativeGrepExecutable({env = process.env, home = homedir(), platform = process.platform} = {}) {
  const name = platform === 'win32' ? 'rg.exe' : 'rg';
  const candidates = (env.PATH || '').split(platform === 'win32' ? ';' : ':')
    .filter(dir => dir && path.isAbsolute(dir)).map(dir => path.join(dir, name));
  candidates.push(path.join(env.XDG_CACHE_HOME || path.join(home, '.cache'), 'opencode', 'bin', name));
  for (const file of candidates) {
    try {if ((await stat(file)).isFile()) return file;}
    catch (error) {if (!['ENOENT', 'ENOTDIR', 'EACCES'].includes(error.code)) throw error;}
  }
  throw new Error('Native ripgrep executable unavailable; configure the host binary path');
}

export function createNativeGrepTool({tool, root, executable, validateScope,
  normalizeArgs = args => args, run = boundedNativeGrep}) {
  if (typeof tool !== 'function' || !tool.schema || typeof validateScope !== 'function') {
    throw new Error('Native grep requires the host SDK and scope validator');
  }
  const key = value => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
  return tool({
    description: 'Search current task files by regex; exact paths and include globs narrow the search. Long matching lines return bounded previews.',
    args: {
      pattern: tool.schema.string().describe('The regex pattern to search for in file contents'),
      path: tool.schema.string().optional().describe('Directory or exact file within the qualified current task'),
      include: tool.schema.string().optional().describe('File glob, for example *.js or *.{ts,tsx}'),
    },
    async execute(args, context) {
      if (!context?.sessionID || typeof context.directory !== 'string'
          || key(context.directory) !== key(root) || typeof context.ask !== 'function') {
        throw new Error('Current native search context required');
      }
      if (context.abort?.aborted) throw new Error('Search aborted');
      await validateScope(args, context);
      Object.assign(args, normalizeArgs(args));
      await context.ask({permission: 'grep', patterns: [args.pattern], always: ['*'],
        metadata: {path: args.path, include: args.include}});
      return await run({root, executable: executable || await resolveNativeGrepExecutable(), args, signal: context.abort});
    },
  });
}
