const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const graphTools = new Set(['list_projects', 'search_graph', 'search_code', 'trace_path',
  'get_code_snippet', 'get_architecture', 'query_graph', 'get_graph_schema']);

// Representation repair only: never infer a tool, project, symbol, or permission.
export function normalizeGraphToolInput(input) {
  if (!object(input)) throw Error('GRAPH_INPUT_OBJECT_REQUIRED');
  let value = structuredClone(input);
  let normalized = false;
  if (Object.keys(value).length === 1 && object(value.arguments)
      && typeof value.arguments.tool === 'string') {
    value = value.arguments;
    normalized = true;
  }
  if (Object.keys(value).some(key => !['tool', 'arguments'].includes(key))
      || !graphTools.has(value.tool)) throw Error('GRAPH_READONLY_TOOL_REQUIRED');
  if (value.arguments !== undefined && !object(value.arguments)) throw Error('GRAPH_ARGUMENTS_OBJECT_REQUIRED');
  value.arguments ??= {};
  if (Object.hasOwn(value.arguments, 'tool')) throw Error('GRAPH_NESTED_TOOL_CONFLICT');
  if (value.tool === 'trace_path' && Object.hasOwn(value.arguments, 'qualified_name')) {
    const name = value.arguments.qualified_name;
    if (typeof name !== 'string' || !name.trim()
        || (value.arguments.function_name !== undefined && value.arguments.function_name !== name)) {
      throw Error('GRAPH_FUNCTION_NAME_CONFLICT');
    }
    value.arguments.function_name = name;
    delete value.arguments.qualified_name;
    normalized = true;
  }
  return {input: value, normalized};
}

function pathKey(value) {
  if (typeof value !== 'string') return null;
  let result = value.replaceAll('\\', '/').replace(/^\/([a-z])\//i, (_, drive) => drive.toUpperCase() + ':/');
  if (!/^[a-z]:\//i.test(result) || /[\0\r\n*?<>\[\]{}()]/.test(result)
      || result.split('/').some(part => part === '..' || part === '.')) return null;
  return result.replace(/\/$/, '').toLowerCase();
}
const within = (file, root) => file === root || file.startsWith(root + '/');

// Deliberately small grammar. Unsupported shell syntax is left to its owner;
// it is never dispatched to another host by guessing at its meaning.
function words(command) {
  const out = []; let token = '', quote = null, started = false;
  for (const char of command) {
    if (/[\0\r\n`$;&<>]/.test(char)) return null;
    if (quote) {
      if (char === quote) quote = null;
      else token += char;
      started = true;
    } else if (char === '"' || char === "'") { quote = char; started = true; }
    else if (/\s/.test(char)) { if (started) out.push(token); token = ''; started = false; }
    else if (char === '|') { if (started) out.push(token); out.push('|'); token = ''; started = false; }
    else { token += char; started = true; }
  }
  if (quote) return null;
  if (started) out.push(token);
  return out;
}

export function planClientRead(command, {stationRoot, graphProjects = [], localRoots = [], prefixes = []} = {}) {
  if (typeof command !== 'string' || command.length > 12000) return null;
  let plain = command;
  for (;;) {
    const prefix = prefixes.find(value => typeof value === 'string' && value && plain.startsWith(value));
    if (!prefix) break;
    plain = plain.slice(prefix.length);
  }
  const tokens = words(plain), root = pathKey(stationRoot);
  if (!tokens || !root || tokens[0] !== 'grep') return null;
  const pipe = tokens.indexOf('|');
  if (pipe >= 0 && (tokens.length !== pipe + 3 || tokens[pipe + 1] !== 'head'
      || !/^-[1-9][0-9]{0,3}$/.test(tokens[pipe + 2]) || Number(tokens[pipe + 2].slice(1)) > 2000)) return null;
  const args = tokens.slice(1, pipe < 0 ? undefined : pipe);
  const positional = []; let recursive = false, insensitive = false;
  for (const arg of args) {
    if (/^-[nEFirlRH]+$/.test(arg)) { recursive ||= /[rR]/.test(arg); insensitive ||= arg.includes('i'); }
    else if (arg === '--recursive') recursive = true;
    else if (/^--include=\*\.[a-z0-9]{1,12}$/i.test(arg)) { if (!recursive) return null; }
    else if (arg.startsWith('-')) return null;
    else positional.push(arg);
  }
  if (positional.length !== 2) return null;
  const [pattern, file] = positional, key = pathKey(file);
  if (!key || !within(key, root) || localRoots.some(value => {
    const local = pathKey(value); return local && within(key, local);
  })) return null;
  if (/(?:^|\/)(?:\.env(?:\.[^/]*)?|\.ssh|credentials\.json|auth\.json|secrets\.json)(?:\/|$)|\.private\.[^/]+$|\.(?:key|pem|pfx|p12)$/i.test(key)) return null;
  if (!recursive) {
    if (!/\.[\p{L}\p{N}_-]{1,16}$/u.test(key) || !pattern) return null;
    return {kind: 'station_command', command: plain, filePath: file, pattern,
      sourceAuthority: false, originalCommandUnchanged: true};
  }
  if (!/^[\p{L}_][\p{L}\p{N}_]{0,159}$/u.test(pattern)) return null;
  const candidates = graphProjects.filter(value => typeof value.name === 'string' && value.name
    && pathKey(value.root) && within(key, pathKey(value.root)))
    .sort((a, b) => pathKey(b.root).length - pathKey(a.root).length);
  if (!candidates.length || (candidates[1] && pathKey(candidates[0].root).length === pathKey(candidates[1].root).length)) return null;
  return {kind: 'indexed_symbol_lookup', tool: 'search_graph',
    arguments: {project: candidates[0].name, name_pattern: (insensitive ? '(?i)' : '') + '^' + pattern + '$', limit: 6},
    requestedDirectory: file, sourceAuthority: false, currentSourceReadCompleted: false};
}
