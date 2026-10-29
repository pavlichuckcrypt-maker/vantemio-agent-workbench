import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeGraphToolInput, planClientRead} from '../src/tool-read-boundary.mjs';

const options = {stationRoot: 'C:/Project', graphProjects: [
  {name: 'tools-current', root: 'C:/Project/tools'},
  {name: 'montage-current', root: 'C:/Project/tools/станция/montage_engine'},
]};
const exact = 'grep -n "SHORT_MIN_FRAMES\\|SHORT_MAX_FRAMES\\|SHORT_PLAN_SCHEMA" "C:/Project/tools/scene_adapter.py"';
const recursive = 'grep -rln "build_clip_windows" "C:/Project/tools" --include=*.py';

test('repairs the original unique graph envelope without mutating original arguments', () => {
  const input = {arguments: {tool: 'search_code', arguments: {project: 'tools-current', query: 'select_highlight_window'}}};
  const before = structuredClone(input), result = normalizeGraphToolInput(input);
  assert.deepEqual(result.input, input.arguments); assert.equal(result.normalized, true); assert.deepEqual(input, before);
});
test('preserves a correct graph request and maps only the exact trace symbol alias', () => {
  assert.equal(normalizeGraphToolInput({tool: 'search_graph', arguments: {project: 'p'}}).normalized, false);
  assert.deepEqual(normalizeGraphToolInput({tool: 'trace_path', arguments: {project: 'p', qualified_name: 'p.mod.fn'}}).input,
    {tool: 'trace_path', arguments: {project: 'p', function_name: 'p.mod.fn'}});
});
test('never resolves conflicting envelopes, functions, operations or invented projects', () => {
  for (const input of [null, [], {tool: 'execute'}, {tool: 'search_graph', extra: true},
    {tool: 'search_graph', arguments: {tool: 'query_graph'}}, {tool: 'trace_path', arguments: {function_name: 'a', qualified_name: 'b'}}]) {
    assert.throws(() => normalizeGraphToolInput(input));
  }
  assert.deepEqual(normalizeGraphToolInput({tool: 'search_graph'}).input.arguments, {});
});
test('the exact reported Book grep is a Station search, preserving the requested command', () => {
  const result = planClientRead(exact, options);
  assert.equal(result.kind, 'station_command'); assert.equal(result.command, exact);
  assert.equal(result.filePath, 'C:/Project/tools/scene_adapter.py'); assert.equal(result.sourceAuthority, false);
});
test('the reported recursive grep uses declared graph metadata rather than traversing a drive', () => {
  assert.deepEqual(planClientRead(recursive, options), {kind: 'indexed_symbol_lookup', tool: 'search_graph',
    arguments: {project: 'tools-current', name_pattern: '^build_clip_windows$', limit: 6},
    requestedDirectory: 'C:/Project/tools', sourceAuthority: false, currentSourceReadCompleted: false});
});
test('respects verified local source copies and chooses the most specific declared index', () => {
  assert.equal(planClientRead(exact, {...options, localRoots: ['C:/Project/tools']}), null);
  const result = planClientRead('grep -rn "build_clip_windows" "C:/Project/tools/станция/montage_engine"', options);
  assert.equal(result.arguments.project, 'montage-current');
  assert.equal(planClientRead(recursive.replace('-rln', '-riln'), options).arguments.name_pattern,
    '(?i)^build_clip_windows$');
});
test('accepts exact UTF8 paths, owned prologues and bounded head without changing pattern quoting', () => {
  const cmd = 'grep -n "fps" "/c/Project/tools/станция/montage_engine/act.py" | head -80';
  assert.equal(planClientRead('owned; ' + cmd, {...options, prefixes: ['owned; ']}).command, cmd);
});
test('never turns writes, shell substitution, compounds, ambiguous scopes or traversal into reads', () => {
  for (const command of [exact + ' > output.txt', exact + '; Remove-Item other', exact + ' && whoami',
    'grep -n "$(command)" C:/Project/tools/x.py', 'grep -n "`command`" C:/Project/tools/x.py',
    'grep -n x C:/Project/../private.py', 'grep -n x C:/Project2/tools/x.py', 'grep -n x C:/Project/tools/*.py',
    'grep -n x C:/Project/tools/[xy].py', 'grep -n x C:/Project/tools/{x,y}.py',
    'grep -n x C:/Project/tools/connection.private.json', 'grep -n x C:/Project/tools/credentials.json',
    'grep -n x C:/Project/tools/server.key',
    'grep -n x C:/Project/tools', 'grep -rn "a.*" C:/Project/tools', 'grep -rn x C:/Project',
    exact + ' | head -9999', 'grep --unknown x C:/Project/tools/x.py']) assert.equal(planClientRead(command, options), null, command);
  assert.equal(planClientRead(recursive, {...options, graphProjects: [...options.graphProjects, {name: 'other', root: 'C:/Project/tools'}]}), null);
});
