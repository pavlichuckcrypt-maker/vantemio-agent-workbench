import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const npm = process.env.npm_execpath;
if (!npm || !path.isAbsolute(npm)) throw Error('Run with npm run smoke:install');
const temporary = await mkdtemp(path.join(os.tmpdir(),'agent-backend-install-'));
const cache = path.join(temporary,'npm-cache');
const run = (args,cwd) => execFileSync(process.execPath,args,{cwd,encoding:'utf8',timeout:45000,
  env:{...process.env,npm_config_cache:cache},stdio:['ignore','pipe','pipe']});
try {
  const packed = JSON.parse(run([npm,'pack','--offline','--ignore-scripts','--json',
    '--pack-destination',temporary],root));
  const archive = path.join(temporary,packed[0].filename);
  const consumer = path.join(temporary,'consumer');
  await mkdir(consumer);
  await writeFile(path.join(consumer,'package.json'),JSON.stringify({private:true,type:'module'}));
  run([npm,'install','--offline','--ignore-scripts','--no-audit','--no-fund','--package-lock=false',archive],consumer);
  await writeFile(path.join(consumer,'verify.mjs'),`
import assert from 'node:assert/strict';
import {writeFile,readFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {createTaskContextTransform} from 'vantemio-agentic-backend/task-context';
import {captureSourceReadEvidence,restoreCurrentEvidence} from 'vantemio-agentic-backend/evidence-context';
import {createAgentRequestAdapter} from 'vantemio-agentic-backend/request-adapter';
import {normalizeProviderUsage,aggregateProviderUsage} from 'vantemio-agentic-backend/usage';

const workspaceRoot=path.join(process.cwd(),'task');
await mkdir(workspaceRoot);
await writeFile(path.join(workspaceRoot,'TECHNICAL_TASK.md'),'Implement the current consumer');
await writeFile(path.join(workspaceRoot,'REQUIREMENTS.md'),'Preserve original call identity');
await writeFile(path.join(workspaceRoot,'module.mjs'),'export const answer = 42;\\n');
const task={binding:{actorID:'actor-a',sessionID:'session-a',goalID:'goal-a',revision:1,inputID:'input-a'},
  workspaceRoot,fullGoal:'The full approved development Goal',projectContext:'Approved architecture and prototype',ownerStop:false,providerID:'provider-a',modelID:'model-a',busy:false,pendingPermission:false,liveTools:false,unknownTools:false,unknownAdmissions:false};
const transform=createTaskContextTransform({resolveTask:async()=>task,maxContextBytes:262144});
const first={system:['Native instructions']};
await transform({sessionID:'session-a'},first);
const toolCall={id:'call-read-a',type:'function',function:{name:'read',arguments:'{"path":"module.mjs"}'}};
// The normal owned tool runs once, not inside a retry/projection helper.
const bytes=await readFile(path.join(workspaceRoot,'module.mjs'));
const record=captureSourceReadEvidence({binding:task.binding,toolCall,receiptID:'receipt-a',sourcePath:'module.mjs',
  sourceBytes:bytes,range:{startLine:1,endLine:1}});
const original=structuredClone(record.original);
await writeFile(path.join(workspaceRoot,'TECHNICAL_TASK.md'),'Verify the implemented consumer');
task.binding.inputID='input-b';
const messages=[{role:'assistant',tool_calls:[toolCall]},{role:'tool',tool_call_id:toolCall.id,content:'Original read reference'}];
const next={system:['Native instructions']};
await transform({sessionID:'session-a'},next);
const projected=restoreCurrentEvidence({binding:task.binding,ownerStop:false,records:[record],originalResults:[original],
  currentSources:[{binding:task.binding,path:'module.mjs',sha256:createHash('sha256').update(bytes).digest('hex'),proofID:'current-version-a'}],
  messages,maxEvidenceBytes:262144});
assert.equal(JSON.parse(next.system[1]).technicalContract,'Verify the implemented consumer');
assert.equal(JSON.parse(next.system[1]).fullGoal,task.fullGoal);
assert.equal(projected.messages[1].content,bytes.toString('utf8'));
assert.equal(projected.decisions[0].status,'current');
assert.equal(messages[1].content,'Original read reference');
const policy=${await readFile(path.join(root,'config/request-policy.example.json'),'utf8')};
const adapter=createAgentRequestAdapter({policy,resolveTask:async()=>task,
  resolveEvidence:async()=>({records:[record],originalResults:[original],currentSources:[{binding:task.binding,path:'module.mjs',sha256:createHash('sha256').update(bytes).digest('hex'),proofID:'current-version-a'}]}),
  measureInput:async({serializedBody})=>({inputTokenUpperBound:Buffer.byteLength(serializedBody,'utf8'),method:'isolated text fixture byte upper bound'}),
  assertSnapshotCurrent:async()=>{assert.equal(task.ownerStop,false)}});
const prepared=await adapter.prepare({sessionID:'session-a',requestID:'installed-request-a',payload:{model:'model-a',max_tokens:1024,
  messages:[{role:'user',content:'Continue the approved implementation'},...messages]}});
await adapter.beforeDispatch(prepared);
assert.equal(JSON.parse(prepared.serializedBody).messages.at(-1).content,bytes.toString('utf8'));
const result=adapter.observe(prepared,{binding:prepared.binding,receiptID:'usage-a',observedAt:1,stage:'final',
  usage:{prompt_tokens:1000,prompt_tokens_details:{cached_tokens:800},completion_tokens:20}});
assert.equal(result.observation.metrics.uncachedInputTokens,200);
assert.equal(aggregateProviderUsage([result.observation,result.observation]).finalRequests,1);
assert.equal(normalizeProviderUsage({format:'chat-completions',binding:prepared.binding,receiptID:'usage-b',observedAt:1,stage:'final',usage:{prompt_tokens:1000}}).metrics.cachedInputTokens,null);
console.log(JSON.stringify({installedExports:true,taskRefresh:true,sourceReuse:true,requestAdapter:true,usageUnknownPreserved:true,providerRequests:0}));
`);
  const result = run([path.join(consumer,'verify.mjs')],consumer);
  console.log(result.trim());
  console.log('Offline packed-package installation and consumer passed. This is not a live provider run.');
} finally {
  await rm(temporary,{recursive:true,force:true});
}
