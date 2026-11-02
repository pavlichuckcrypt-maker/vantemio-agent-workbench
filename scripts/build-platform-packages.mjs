import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {RUNTIME_TARGETS} from '../src/runtime-target.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2),value=name=>{const at=args.indexOf(name);return at<0?undefined:args[at+1];};
const target=value('--target'),output=value('--out-dir');
if(!RUNTIME_TARGETS[target])throw Error('EXPLICIT_PLATFORM_BUILD_TARGET_REQUIRED');
if(!output||!path.isAbsolute(output))throw Error('ABSOLUTE_PLATFORM_OUTPUT_REQUIRED');
const npm=process.env.npm_execpath;if(!npm||!path.isAbsolute(npm))throw Error('RUN_PLATFORM_BUILD_WITH_NPM');
const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'vantemio-platform-package-'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
try{
 const stage=path.join(temporary,'package');await fs.cp(path.join(root,'packages',target),stage,{recursive:true,errorOnExist:true});
 const core=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8')),pkg=JSON.parse(await fs.readFile(path.join(stage,'package.json'),'utf8'));
 if(pkg.name!==RUNTIME_TARGETS[target].packageName)throw Error('PLATFORM_SOURCE_PACKAGE_NAME_MISMATCH');
 if(pkg.workbenchCoreVersion!==core.version)throw Error('PLATFORM_SHARED_CORE_VERSION_NOT_EXPLICITLY_ADOPTED');
 const selected=new Set();
 async function include(relative){
  const file=path.resolve(root,relative),rel=path.relative(root,file).replaceAll('\\','/');
  if(!/^(?:src|config)\//u.test(rel)||rel.split('/').includes('..'))throw Error('PLATFORM_CORE_DEPENDENCY_OUTSIDE_LIBRARY');
  if(selected.has(rel))return;selected.add(rel);
  const stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink())throw Error('PLATFORM_CORE_REGULAR_FILE_REQUIRED');
  const bytes=await fs.readFile(file),to=path.join(stage,'core',rel);await fs.mkdir(path.dirname(to),{recursive:true});await fs.writeFile(to,bytes);
  if(!rel.endsWith('.mjs'))return;
  const source=bytes.toString('utf8'),dependencies=[...source.matchAll(/\b(?:import|export)\s+(?:[^;]*?\sfrom\s*)?['"](\.[^'"]+)['"]|\bimport\s*\(\s*['"](\.[^'"]+)['"]|\bnew URL\(\s*['"](\.[^'"]+)['"]/gu)];
  for(const match of dependencies){const value=match[1]??match[2]??match[3];await include(path.relative(root,path.resolve(path.dirname(file),value)));}
 }
 const entry=await fs.readFile(path.join(stage,'index.mjs'),'utf8');
 for(const match of entry.matchAll(/['"]\.\/core\/((?:src|config)\/[^'"]+)['"]/gu))await include(match[1]);
 await include('config/shared-library.manifest.json');
 await fs.writeFile(path.join(stage,'core','package.json'),JSON.stringify({name:core.name,version:core.version,type:'module',private:true,kind:'shared-library'},null,2)+'\n');
 for(const name of ['LICENSE','THIRD_PARTY.md'])await fs.copyFile(path.join(root,name),path.join(stage,name));
 const files=[];
 async function visit(directory,relative=''){for(const name of(await fs.readdir(directory)).sort()){const file=path.join(directory,name),rel=relative?relative+'/'+name:name,stat=await fs.lstat(file);if(stat.isSymbolicLink())throw Error('PLATFORM_PACKAGE_SYMLINK_FORBIDDEN');if(stat.isDirectory())await visit(file,rel);else files.push({path:rel,sha256:sha(await fs.readFile(file)),bytes:stat.size});}}
 await visit(stage);
 const manifest={schema:'vantemio.runtime-release/v1',kind:'platform-backend',runtimeTarget:target,packageName:pkg.name,version:pkg.version,coreVersion:core.version,coreIsVersionedReadOnly:true,payloadSHA256:sha(Buffer.from(JSON.stringify(files))),files};
 await fs.writeFile(path.join(stage,'runtime.manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 const packed=JSON.parse(execFileSync(process.execPath,[npm,'pack','--offline','--ignore-scripts','--json','--pack-destination',temporary],{cwd:stage,encoding:'utf8',timeout:45000}))[0];
 const bytes=await fs.readFile(path.join(temporary,packed.filename));await fs.mkdir(output,{recursive:true});const destination=path.join(output,packed.filename);
 try{const existing=await fs.readFile(destination);if(sha(existing)!==sha(bytes))throw Error('PLATFORM_RELEASE_ALREADY_EXISTS_WITH_DIFFERENT_BYTES_BUMP_VERSION');}catch(error){if(error.code!=='ENOENT')throw error;await fs.writeFile(destination,bytes,{flag:'wx'});}
 const result={runtimeTarget:target,packageName:pkg.name,version:pkg.version,coreVersion:core.version,archive:destination,sha256:sha(bytes),payloadSHA256:manifest.payloadSHA256,files:files.length};
 await fs.writeFile(destination+'.sha256',result.sha256+'  '+packed.filename+'\n');
 await fs.writeFile(destination+'.manifest.json',JSON.stringify(manifest,null,2)+'\n');
 process.stdout.write(JSON.stringify(result)+'\n');
}finally{await fs.rm(temporary,{recursive:true,force:true});}
