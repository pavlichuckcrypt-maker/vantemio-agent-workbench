import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, rm, unlink} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createTaskContextTransform} from '../src/task-context-hook.mjs';

async function fixture(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'bound-task-hook-'));
  await writeFile(path.join(root, 'TECHNICAL_TASK.md'), 'Implement current consumer');
  await writeFile(path.join(root, 'REQUIREMENTS.md'), 'Preserve original outcomes');
  const task = {
    binding: {actorID:'actor-a', sessionID:'session-a', goalID:'goal-a', revision:1, inputID:'input-a'},
    workspaceRoot:root, fullGoal:'Full approved Goal',
    projectContext:'Existing architecture and approved prototype references', ownerStop:false,
  };
  try { await run(task); } finally { await rm(root, {recursive:true, force:true}); }
}
const input = {sessionID:'session-a'};
const make = resolveTask => createTaskContextTransform({resolveTask, maxContextBytes:1048576});

test('normal model/tool caller sees changed documents on its next model step', async () => {
  await fixture(async task => {
    const transform = make(async () => task);
    const originalHistory = [{role:'user', content:'Original input'}];
    const historyBefore = structuredClone(originalHistory);
    const requests = [];
    async function modelStep() {
      const output = {system:['Native system'], messages:originalHistory};
      await transform(input, output);
      requests.push(structuredClone(output)); // An offline caller, never a provider probe.
    }
    await modelStep();
    async function normalTool() {
      await writeFile(path.join(task.workspaceRoot, 'TECHNICAL_TASK.md'), 'Verify implemented consumer');
      await writeFile(path.join(task.workspaceRoot, 'REQUIREMENTS.md'), 'New negative scenario');
    }
    await normalTool();
    task.binding.inputID = 'input-b';
    await modelStep();
    const a = JSON.parse(requests[0].system[1]), b = JSON.parse(requests[1].system[1]);
    assert.equal(a.technicalContract, 'Implement current consumer');
    assert.equal(b.technicalContract, 'Verify implemented consumer');
    assert.equal(b.requirements, 'New negative scenario');
    assert.equal(b.fullGoal, task.fullGoal);
    assert.equal(b.projectContext, task.projectContext);
    assert.deepEqual(originalHistory, historyBefore);
    assert.equal(requests[1].system[0], 'Native system');
  });
});

test('unchanged documents produce a stable prefix despite a new input ID', async () => {
  await fixture(async task => {
    const transform = make(async () => task), a={system:[]}, b={system:[]};
    await transform(input,a);
    task.binding.inputID='input-b';
    await transform(input,b);
    assert.deepEqual(a,b);
  });
});

for (const field of ['actorID','sessionID','goalID','revision','inputID']) {
  test('changed '+field+' during the read rejects without changing system', async () => {
    await fixture(async task => {
      let reads=0;
      const transform=make(async()=>{
        if (++reads===2) task.binding[field]=field==='revision'?2:'changed';
        return task;
      });
      const output={system:['native']};
      await assert.rejects(transform(input,output), /TASK_CONTEXT_(CHANGED|SESSION_MISMATCH)/);
      assert.deepEqual(output,{system:['native']});
    });
  });
}

for (const field of ['workspaceRoot','fullGoal','projectContext']) {
  test('changed '+field+' during the read rejects atomically', async () => {
    await fixture(async task => {
      let calls=0;
      const transform=make(async()=>{
        if (++calls===2) return {...task,[field]:field==='workspaceRoot'?os.tmpdir():'changed'};
        return task;
      });
      const output={system:['native']};
      await assert.rejects(transform(input,output),/TASK_CONTEXT_CHANGED/);
      assert.deepEqual(output.system,['native']);
    });
  });
}

test('owner Stop at either boundary is preserved', async () => {
  await fixture(async task => {
    for (const stopAt of [1,2]) {
      let calls=0;
      const transform=make(async()=>({...task, ownerStop:++calls>=stopAt}));
      const output={system:['native']};
      await assert.rejects(transform(input,output),/TASK_CONTEXT_OWNER_STOP/);
      assert.deepEqual(output.system,['native']);
    }
  });
});

test('missing files and oversized context never truncate or modify output',async()=>{
  await fixture(async task=>{
    const output={system:['native']};
    const small=createTaskContextTransform({resolveTask:async()=>task,maxContextBytes:8});
    await assert.rejects(small(input,output),/TASK_CONTEXT_TOO_LARGE/);
    await unlink(path.join(task.workspaceRoot,'REQUIREMENTS.md'));
    await assert.rejects(make(async()=>task)(input,output),e=>e.code==='ENOENT');
    assert.deepEqual(output.system,['native']);
  });
});

test('unbound, malformed or mismatched sessions reject before reading files',async()=>{
  const cases=[null,{}, {binding:{}},
    {binding:{actorID:'a',sessionID:'other',goalID:'g',revision:1,inputID:'i'},
      workspaceRoot:os.tmpdir(),fullGoal:'goal',projectContext:'context',ownerStop:false}];
  for(const task of cases) await assert.rejects(make(async()=>task)(input,{system:[]}),/TASK_CONTEXT_(INVALID|SESSION_MISMATCH)/);
  assert.throws(()=>createTaskContextTransform({resolveTask:async()=>null,maxContextBytes:Infinity}),/TASK_CONTEXT_INVALID/);
});

test('concurrent sessions have no captured shared task text',async()=>{
  await fixture(async a=>{await fixture(async b=>{
    b.binding={...b.binding,actorID:'actor-b',sessionID:'session-b'};
    b.fullGoal='Other Goal';
    const transform=make(async x=>x.sessionID==='session-a'?a:b);
    const x={system:[]}, y={system:[]};
    await Promise.all([transform(input,x),transform({sessionID:'session-b'},y)]);
    assert.equal(JSON.parse(x.system[0]).fullGoal,a.fullGoal);
    assert.equal(JSON.parse(y.system[0]).fullGoal,b.fullGoal);
  });});
});
