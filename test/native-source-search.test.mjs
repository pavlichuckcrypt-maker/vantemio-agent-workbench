import test from 'node:test';
import assert from 'node:assert/strict';
import * as boundary from '../src/tool-read-boundary.mjs';
const filter = '!**/.opencode-state/**';
const plan = (...a) => boundary.defaultNativeSourceSearch(...a);
test('unspecified native grep excludes generated state without changing pattern or caller args', () => {
 const args = {pattern:'CURRENT_SOURCE_AUDIT_MARKER'};
 const result = plan('grep',args);
 assert.deepEqual(result,{args:{...args,include:filter},changed:true});
 assert.deepEqual(args,{pattern:'CURRENT_SOURCE_AUDIT_MARKER'});
});
for (const [name,args] of Object.entries({exactState:{pattern:'x',path:'.opencode-state/request-memory'},explicitRoot:{pattern:'x',path:'.'},explicitInclude:{pattern:'x',include:'*.md'},emptyInclude:{pattern:'x',include:''},emptyPath:{pattern:'x',path:''}})) {
 test(`explicit search preserved: ${name}`,()=>assert.deepEqual(plan('grep',args),{args,changed:false}));
}
test('native glob stays unchanged',()=>{const a={pattern:'**/*.py'};assert.deepEqual(plan('glob',a),{args:a,changed:false});});
test('default is idempotent',()=>{const a=plan('grep',{pattern:'x'}).args;assert.deepEqual(plan('grep',a),{args:a,changed:false});});
test('invalid args remain for native validation',()=>{for(const a of [null,undefined,[],3])assert.deepEqual(plan('grep',a),{args:a,changed:false});});
test('other native options are retained',()=>{const a={pattern:'x',limit:12,caseSensitive:false};assert.deepEqual(plan('grep',a).args,{...a,include:filter});});

test('real ripgrep: source matches survive while oversized generated JSON is excluded', async t => {
 const {spawnSync} = await import('node:child_process');
 const {mkdtemp,writeFile,mkdir,rm} = await import('node:fs/promises');
 const {tmpdir} = await import('node:os');
 const {join} = await import('node:path');
 const probe = spawnSync('rg',['--version']);
 if(probe.error?.code === 'ENOENT') return t.skip('ripgrep not installed');
 assert.equal(probe.status,0);
 const root=await mkdtemp(join(tmpdir(),'source-search-'));
 try {
  const pattern='CURRENT_SOURCE_AUDIT_MARKER';
  await mkdir(join(root,'.opencode-state'));
  await writeFile(join(root,'PLAN.md'),pattern+'\n');
  await writeFile(join(root,'source.py'),'# '+pattern+'\n');
  await writeFile(join(root,'.opencode-state','original.json'),JSON.stringify({text:'x'.repeat(100000)+pattern}));
  const run=include=>spawnSync('rg',['--no-config','--json','--hidden',...(include?['--glob='+include]:[]),'--glob=!**/.git/**','--',pattern,'.'],{cwd:root,maxBuffer:2000000,encoding:'utf8'});
  const before=run(); assert.equal(before.status,0);
  assert.ok(Math.max(...before.stdout.trim().split('\n').map(x=>Buffer.byteLength(x)))>65536);
  const after=run(plan('grep',{pattern}).args.include); assert.equal(after.status,0);
  const rows=after.stdout.trim().split('\n');assert.ok(rows.every(x=>Buffer.byteLength(x)<65536));
  const paths=rows.map(x=>JSON.parse(x)).filter(x=>x.type==='match').map(x=>x.data.path.text.replaceAll('\\','/')).sort();
  assert.deepEqual(paths,['./PLAN.md','./source.py']);
  assert.ok(run('**/.opencode-state/**').stdout.includes(pattern));
 } finally {await rm(root,{recursive:true,force:true});}
});
