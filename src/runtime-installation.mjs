import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash,randomUUID} from 'node:crypto';
import {assertRuntimeTarget,assertSeparateRuntimeInstallations} from './runtime-target.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function optional(file){try{return await fs.readFile(file);}catch(error){if(error.code==='ENOENT')return null;throw error;}}
function relativeFile(value){
 if(typeof value!=='string'||!value||value.includes('\\')||value.includes(':')||value.includes('\0')||value.startsWith('/')||value.split('/').some(x=>!x||x==='.'||x==='..'))throw Error('RUNTIME_PACKAGE_PATH_INVALID');
 return value;
}
export async function stageRuntimePackage({expectedTarget,packageRoot,installations,actualHost=os.hostname()}){
 // No destination writes occur until the complete package and installation set qualify.
 assertSeparateRuntimeInstallations(installations);
 const installation=installations.find(x=>x.runtimeTarget===expectedTarget&&x.host.toLowerCase()===actualHost.toLowerCase());
 if(!installation)throw Error('RUNTIME_REGISTERED_INSTALLATION_REQUIRED');
 const sourceRoot=await fs.realpath(packageRoot),manifest=JSON.parse(await fs.readFile(path.join(sourceRoot,'runtime.manifest.json'),'utf8'));
 const plan=assertRuntimeTarget({expectedTarget,release:manifest,installation,actualHost});
 if(!Array.isArray(manifest.files)||!manifest.files.length||sha(Buffer.from(JSON.stringify(manifest.files)))!==manifest.payloadSHA256)throw Error('RUNTIME_PACKAGE_CONTENT_MANIFEST_INVALID');
 const roots=await Promise.all(installations.filter(x=>x.host.toLowerCase()===actualHost.toLowerCase()).map(async x=>{const root=await fs.realpath(x.installRoot);return{...x,installRoot:root,currentReleaseFile:path.join(root,'CURRENT_RELEASE.json')};}));
 assertSeparateRuntimeInstallations(roots);
 const destinationRoot=await fs.realpath(plan.installRoot),files=[],seen=new Set();
 for(const entry of manifest.files){
  const relative=relativeFile(entry?.path),fold=process.platform==='win32'?relative.toLowerCase():relative;
  if(seen.has(fold))throw Error('RUNTIME_PACKAGE_DUPLICATE_PATH');seen.add(fold);
  const source=path.join(sourceRoot,relative),real=await fs.realpath(source),rel=path.relative(sourceRoot,real),stat=await fs.lstat(source);
  if(!rel||rel.startsWith('..'+path.sep)||path.isAbsolute(rel)||stat.isSymbolicLink()||!stat.isFile())throw Error('RUNTIME_PACKAGE_SOURCE_ESCAPE');
  const bytes=await fs.readFile(source);if(sha(bytes)!==entry.sha256||bytes.length!==entry.bytes)throw Error('RUNTIME_PACKAGE_CONTENT_CHANGED');
  files.push({relative,bytes});
 }
 const releases=path.join(destinationRoot,'releases'),releaseRoot=path.join(releases,manifest.version+'-'+manifest.payloadSHA256.slice(0,12)),pointer=path.join(destinationRoot,'STAGED_RELEASE.json'),prior=await optional(pointer);
 for(const directory of [releases,releaseRoot]){
  try{const real=await fs.realpath(directory),relative=path.relative(destinationRoot,real);if(!relative||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw Error('RUNTIME_STAGE_DESTINATION_ESCAPE');}
  catch(error){if(error.code!=='ENOENT')throw error;}
 }
 const existing=await optional(path.join(releaseRoot,'runtime.manifest.json'));
 if(existing){
  if(sha(existing)!==sha(Buffer.from(JSON.stringify(manifest,null,2)+'\n')))throw Error('RUNTIME_IMMUTABLE_RELEASE_CONFLICT');
  for(const file of manifest.files){const actual=await optional(path.join(releaseRoot,file.path));if(!actual||sha(actual)!==file.sha256)throw Error('RUNTIME_IMMUTABLE_RELEASE_CONFLICT');}
 }
 else{
  await fs.mkdir(releases,{recursive:true});const temporary=path.join(releases,'.stage-'+randomUUID());await fs.mkdir(temporary);
  try{
   for(const file of files){const to=path.join(temporary,file.relative);await fs.mkdir(path.dirname(to),{recursive:true});await fs.writeFile(to,file.bytes,{flag:'wx'});}
   await fs.writeFile(path.join(temporary,'runtime.manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
   await fs.rename(temporary,releaseRoot);
  }catch(error){await fs.rm(temporary,{recursive:true,force:true});throw error;}
 }
 const current=await optional(pointer);if((current===null)!==(prior===null)||current&&sha(current)!==sha(prior))throw Error('RUNTIME_STAGE_POINTER_CAS_CHANGED');
 const result={schema:'vantemio.runtime-stage/v1',runtimeTarget:expectedTarget,packageName:manifest.packageName,version:manifest.version,coreVersion:manifest.coreVersion,payloadSHA256:manifest.payloadSHA256,releaseRoot,configFile:plan.configFile,nativeConfigurationModified:false,nativeActivationPerformed:false};
 const temporary=pointer+'.'+randomUUID()+'.tmp';await fs.writeFile(temporary,JSON.stringify(result,null,2)+'\n',{flag:'wx'});await fs.rename(temporary,pointer);return result;
}
