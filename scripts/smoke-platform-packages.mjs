import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),npm=process.env.npm_execpath;
if(!npm||!path.isAbsolute(npm))throw Error('RUN_WITH_NPM');
const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'vantemio-two-platforms-'));
const run=(args,cwd)=>execFileSync(process.execPath,args,{cwd,encoding:'utf8',timeout:45000,env:{...process.env,npm_config_cache:path.join(temporary,'cache')}});
try{
 const archives=[],expectedCores={};
 for(const target of ['opencode-watch','deepseek-harness-chief']){
  expectedCores[target]=JSON.parse(await fs.readFile(path.join(root,'packages',target,'package.json'),'utf8')).workbenchCoreVersion;
  const output=run([path.join(root,'scripts/build-platform-packages.mjs'),'--target',target,'--out-dir',path.join(temporary,target)],root);archives.push(JSON.parse(output.trim()).archive);
 }
 const consumer=path.join(temporary,'consumer');await fs.mkdir(consumer);await fs.writeFile(path.join(consumer,'package.json'),'{"private":true,"type":"module"}');
 run([npm,'install','--offline','--ignore-scripts','--no-audit','--no-fund','--package-lock=false',...archives],consumer);
 const verify=`import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {fileURLToPath} from 'node:url';
import * as open from 'vantemio-opencode-watch';import * as chief from 'vantemio-deepseek-harness-chief';
assert.equal(open.runtimeTarget,'opencode-watch');assert.equal(chief.runtimeTarget,'deepseek-harness-chief');
assert.equal(typeof open.selectTaskDiagnosticOriginal,'function');assert.equal(typeof chief.projectHarnessWorkingNotes,'function');
assert.equal(typeof open.projectVerifiedTaskSourceCacheReads,'function');assert.equal(typeof open.stationReadEnvelope,'function');assert.equal(typeof open.hydrateNativeReadProofTexts,'function');assert.equal(typeof open.sharedVerifiedMessageArchive,'function');
const openRoot=fileURLToPath(new URL('.',import.meta.resolve('vantemio-opencode-watch'))),chiefRoot=fileURLToPath(new URL('.',import.meta.resolve('vantemio-deepseek-harness-chief')));
assert.equal(JSON.parse(await fs.readFile(path.join(openRoot,'core/package.json'),'utf8')).version,${JSON.stringify(expectedCores['opencode-watch'])});assert.equal(JSON.parse(await fs.readFile(path.join(chiefRoot,'core/package.json'),'utf8')).version,${JSON.stringify(expectedCores['deepseek-harness-chief'])});
assert.equal(await fs.stat(path.join(openRoot,'core/src/harness-root-context.mjs')).then(()=>true,()=>false),false);
assert.equal(await fs.stat(path.join(chiefRoot,'core/src/native-grep-tool.mjs')).then(()=>true,()=>false),false);
const states=[];for(const target of [open.runtimeTarget,chief.runtimeTarget]){const root=path.join(process.cwd(),'state',target);await fs.mkdir(root,{recursive:true});const config=path.join(root,target===open.runtimeTarget?'opencode.json':'cordis.patch.yml');await fs.writeFile(config,'native-original');await fs.writeFile(path.join(root,'CURRENT_RELEASE.json'),'accepted-original');states.push({schema:'vantemio.runtime-installation/v1',runtimeTarget:target,host:os.hostname(),installRoot:root,currentReleaseFile:path.join(root,'CURRENT_RELEASE.json'),configFile:config});}
let writes=0;await assert.rejects(open.applyPlatformRelease(states[1],os.hostname(),async()=>writes++),/RUNTIME_TARGET_MISMATCH/);await assert.rejects(chief.applyPlatformRelease(states[0],os.hostname(),async()=>writes++),/RUNTIME_TARGET_MISMATCH/);assert.equal(writes,0);
const a=await open.stagePlatformRelease(states,os.hostname()),b=await chief.stagePlatformRelease(states,os.hostname());assert.notEqual(a.releaseRoot,b.releaseRoot);
for(const state of states){assert.equal(await fs.readFile(state.configFile,'utf8'),'native-original');assert.equal(await fs.readFile(state.currentReleaseFile,'utf8'),'accepted-original');}
console.log(JSON.stringify({bothNamedPackagesInstalled:true,oppositePlatformAdaptersExcluded:true,crossTargetRejectedBeforeWrites:true,separateStagedRoots:true,nativeProfilesUnchanged:true,providerRequests:0}));`;
 await fs.writeFile(path.join(consumer,'verify.mjs'),verify);process.stdout.write(run([path.join(consumer,'verify.mjs')],consumer));
}finally{await fs.rm(temporary,{recursive:true,force:true});}
