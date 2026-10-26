import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,symlink,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {qualifySourceView,qualifySourceViewFile} from '../src/source-view.mjs';

async function fixture(fn) {
  const base=await mkdtemp(path.join(os.tmpdir(),'agent-source-view-'));
  const workspace=path.join(base,'agent'),source=path.join(base,'site'),alias=path.join(workspace,'site');
  await mkdir(workspace);await mkdir(source);await writeFile(path.join(source,'page.mjs'),'export const page="current";\n');
  await symlink(source,alias,process.platform==='win32'?'junction':'dir');
  const binding={actorID:'actor-a',sessionID:'session-a',goalID:'goal-a',revision:2};
  const options={binding,expectedHost:'node-a',workspaceRoot:workspace,declaredSourceRoots:[source],ownerStop:false,
    view:{schema:'agent.source-view/v1',binding:{...binding},host:'node-a',viewRoot:alias,sourceRoot:source}};
  try{await fn({base,workspace,source,alias,options});}finally{await rm(base,{recursive:true,force:true});}
}

test('an approved view resolves existing bytes without copying or granting write authority',()=>fixture(async f=>{
  const view=await qualifySourceView(f.options),file=await qualifySourceViewFile(view,path.join(f.alias,'page.mjs'));
  assert.equal(await readFile(file,'utf8'),await readFile(path.join(f.source,'page.mjs'),'utf8'));
  assert.equal(view.sourceOrClaimAuthority,false);assert.equal(view.readOnlyObservation,true);
  assert.ok(Object.isFrozen(view));assert.ok(Object.isFrozen(view.binding));
  f.options.binding.revision=99;assert.equal(view.binding.revision,2);
}));
test('Stop, host and Goal/revision mismatches reject the view',()=>fixture(async f=>{
  await assert.rejects(qualifySourceView({...f.options,ownerStop:true}),/OWNER_STOP/);
  await assert.rejects(qualifySourceView({...f.options,expectedHost:'another-host'}),/HOST_OR_BINDING/);
  await assert.rejects(qualifySourceView({...f.options,binding:{...f.options.binding,revision:3}}),/HOST_OR_BINDING/);
  await assert.rejects(qualifySourceView({...f.options,ownerStop:undefined}),/STOP_STATE/);
}));
test('only an explicitly approved physical source root is accepted',()=>fixture(async f=>{
  await assert.rejects(qualifySourceView({...f.options,declaredSourceRoots:[f.base]}),/UNDECLARED_ROOT/);
  await assert.rejects(qualifySourceView({...f.options,view:{...f.options.view,viewRoot:f.source}}),/OUTSIDE_WORKSPACE/);
  await assert.rejects(qualifySourceView({...f.options,view:{...f.options.view,sourceRoot:f.base}}),/UNDECLARED_ROOT/);
}));
test('traversal and a sibling path cannot be consumed through a view',()=>fixture(async f=>{
  const view=await qualifySourceView(f.options);
  await assert.rejects(qualifySourceViewFile(view,f.alias+path.sep+'..'+path.sep+'page.mjs'),/ABSOLUTE_PATH/);
  await assert.rejects(qualifySourceViewFile(view,path.join(f.workspace,'site-other','page.mjs')),/OUTSIDE_VIEW/);
}));
test('retargeting a directory alias invalidates an earlier qualification',()=>fixture(async f=>{
  const view=await qualifySourceView(f.options),other=path.join(f.base,'other');
  await mkdir(other);await writeFile(path.join(other,'page.mjs'),'different');
  await rm(f.alias,{recursive:true});await symlink(other,f.alias,process.platform==='win32'?'junction':'dir');
  await assert.rejects(qualifySourceViewFile(view,path.join(f.alias,'page.mjs')),/ESCAPES_ROOT/);
}));
test('a lexical workspace child cannot hide an escaped physical parent',()=>fixture(async f=>{
  const outside=path.join(f.base,'outside-parent');await mkdir(outside);
  await symlink(outside,path.join(f.workspace,'escape'),process.platform==='win32'?'junction':'dir');
  const alias=path.join(f.workspace,'escape','site');
  await symlink(f.source,path.join(outside,'site'),process.platform==='win32'?'junction':'dir');
  await assert.rejects(qualifySourceView({...f.options,view:{...f.options.view,viewRoot:alias}}),/PHYSICAL_ROOT_CHANGED/);
}));
test('a nested directory alias cannot escape an approved source root',()=>fixture(async f=>{
  const outside=path.join(f.base,'outside');await mkdir(outside);await writeFile(path.join(outside,'secret.txt'),'not source');
  await symlink(outside,path.join(f.source,'escape'),process.platform==='win32'?'junction':'dir');
  const view=await qualifySourceView(f.options);
  await assert.rejects(qualifySourceViewFile(view,path.join(f.alias,'escape','secret.txt')),/ESCAPES_ROOT/);
  await assert.rejects(qualifySourceViewFile({...view,rootProofSHA256:'0'.repeat(64)},path.join(f.alias,'page.mjs')),/PROOF_CHANGED/);
}));
