import {spawn as spawnChild} from 'node:child_process';
import {stat} from 'node:fs/promises';
import path from 'node:path';
import {StringDecoder} from 'node:string_decoder';

// Use rg's bounded text preview before transport rather than serializing an
// entire matching line into a JSON record. NUL separates paths from row data.
export async function boundedNativeGrep({root, executable, args, signal,
  maxMatches = 100, previewColumns = 2000, maxOutputChars = 16384, timeoutMs = 120000, spawn = spawnChild}) {
  if (signal?.aborted) throw new Error('Search aborted');
  if (typeof root !== 'string' || typeof executable !== 'string'
      || typeof args?.pattern !== 'string' || args.path !== undefined && typeof args.path !== 'string'
      || args.include !== undefined && typeof args.include !== 'string'
      || !Number.isSafeInteger(maxMatches) || maxMatches < 1 || maxMatches > 10000
      || !Number.isSafeInteger(previewColumns) || previewColumns < 1 || previewColumns > 2000
      || !Number.isSafeInteger(maxOutputChars) || maxOutputChars < 1 || maxOutputChars > 1048576
      || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 600000) {
    throw new Error('Invalid bounded grep arguments');
  }
  const target = path.resolve(root, args.path || '.'), info = await stat(target);
  if (!info.isDirectory() && !info.isFile()) throw new Error('Search path is not a file or directory');
  const cwd = info.isDirectory() ? target : path.dirname(target);
  const argv = ['--no-config', '--hidden', '--no-messages', '--line-number', '--with-filename',
    '--null', '--text', '--color=never', '--max-columns=' + previewColumns, '--max-columns-preview',
    ...(args.include ? ['--glob=' + args.include] : []), '--glob=!**/.git/**', '--',
    args.pattern, info.isFile() ? path.basename(target) : '.'];
  if (signal?.aborted) throw new Error('Search aborted');
  return await new Promise((resolve, reject) => {
    const child = spawn(executable, argv, {cwd, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']});
    const decoder = new StringDecoder('utf8'), matches = [];
    let buffer = '', file = null, stderr = '', failure, truncated = false, done = false, outputChars = 0;
    const fail = error => {failure ??= error; child.kill();};
    const abort = () => fail(new Error('Search aborted'));
    const timer = setTimeout(() => fail(new Error('Search deadline exceeded')), timeoutMs);
    signal?.addEventListener('abort', abort, {once: true});
    if (signal?.aborted) abort();
    const consume = () => {
      while (!failure && !truncated) {
        if (file === null) {
          const end = buffer.indexOf('\0');
          if (end < 0) break;
          file = buffer.slice(0, end); buffer = buffer.slice(end + 1);
        }
        const end = buffer.indexOf('\n');
        if (end < 0) break;
        const row = buffer.slice(0, end).replace(/\r$/, ''); buffer = buffer.slice(end + 1);
        const parsed = /^(\d+):(.*)$/.exec(row);
        if (!parsed || !Number.isSafeInteger(Number(parsed[1])) || Number(parsed[1]) < 1) {
          fail(new Error('Invalid ripgrep text record')); break;
        }
        if (matches.length === maxMatches || outputChars + file.length + parsed[2].length + 100 > maxOutputChars) {
          truncated = true; child.kill(); buffer = ''; break;
        }
        outputChars += file.length + parsed[2].length + 100;
        matches.push({file: path.resolve(cwd, file), line: Number(parsed[1]), text: parsed[2]});
        file = null;
      }
      // Windows paths and bounded UTF-8 previews fit here without buffering
      // the source line, regardless of its original byte length.
      if (buffer.length > 131072) fail(new Error('Unbounded ripgrep text record'));
    };
    child.stdout.on('data', bytes => {if (!truncated && !failure) {buffer += decoder.write(bytes); consume();}});
    child.stderr.on('data', bytes => {if (stderr.length < 8192) stderr += bytes.toString('utf8').slice(0, 8192 - stderr.length);});
    child.on('error', error => {failure ??= error;});
    child.on('close', code => {
      if (done) return; done = true; clearTimeout(timer); signal?.removeEventListener('abort', abort);
      buffer += decoder.end(); consume();
      if (failure) return reject(failure);
      if (!truncated && (file !== null || buffer.length)) return reject(new Error('Incomplete ripgrep text record'));
      if (!truncated && code !== 0 && code !== 1 && code !== 2) return reject(new Error(stderr || 'ripgrep failed: ' + code));
      if (!truncated && code === 2 && /regex parse error|error parsing regex/.test(stderr)) return reject(new Error(stderr));
      const partial = !truncated && code === 2;
      const lines = matches.length ? ['Found ' + matches.length + ' matches']
        : [partial ? 'Search incomplete; no matches observed' : truncated ? 'Matches exceed the preview budget; narrow the search' : 'No files found'];
      let previous = null;
      for (const m of matches) {
        if (m.file !== previous) {lines.push(JSON.stringify(m.file) + ':'); previous = m.file;}
        lines.push('  Line ' + m.line + ': ' + m.text);
      }
      if (truncated) lines.push('[Results truncated; narrow the search for further matches.]');
      if (partial) lines.push('[Partial search: ' + stderr.trim() + ']');
      lines.push('[Line preview only; long lines are bounded before transport. Use an exact read for complete Source.]');
      resolve({output: lines.join('\n'), metadata: {nativeGrep: {version: 1, matches: matches.length,
        truncated, partial, previewColumns, originalPatternPreserved: true, shell: false}}});
    });
  });
}
