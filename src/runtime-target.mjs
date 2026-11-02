import path from 'node:path';

export const RUNTIME_TARGETS=Object.freeze({
 'opencode-watch':Object.freeze({packageName:'vantemio-opencode-watch',configNames:['opencode.json','opencode.jsonc']}),
 'deepseek-harness-chief':Object.freeze({packageName:'vantemio-deepseek-harness-chief',configNames:['cordis.patch.yml']}),
});
function absoluteLocation(value){
 if(typeof value!=='string'||!value||value.includes('\0'))throw Error('RUNTIME_ABSOLUTE_PATH_REQUIRED');
 const normalized=value.replaceAll('\\','/');
 if(normalized.split('/').includes('..'))throw Error('RUNTIME_PATH_TRAVERSAL');
 const windows=/^[A-Za-z]:\//.test(normalized)||normalized.startsWith('//');
 if(!windows&&!normalized.startsWith('/'))throw Error('RUNTIME_ABSOLUTE_PATH_REQUIRED');
 const result=(windows?path.win32.normalize(normalized).replaceAll('\\','/').toLowerCase():path.posix.normalize(normalized)).replace(/\/$/,'');
 if(!result||/^[a-z]:$/u.test(result))throw Error('RUNTIME_DEDICATED_ROOT_REQUIRED');
 return result;
}
function installationPlan(installation){
 const spec=RUNTIME_TARGETS[installation?.runtimeTarget];
 if(!spec||installation.schema!=='vantemio.runtime-installation/v1')throw Error('RUNTIME_INSTALLATION_IDENTITY_REQUIRED');
 const root=absoluteLocation(installation.installRoot),pointer=absoluteLocation(installation.currentReleaseFile),config=absoluteLocation(installation.configFile);
 if(pointer!==root+'/CURRENT_RELEASE.json'&&pointer!==root+'/current_release.json')throw Error('RUNTIME_RELEASE_POINTER_OUTSIDE_TARGET');
 if(!spec.configNames.includes(config.slice(config.lastIndexOf('/')+1)))throw Error('RUNTIME_CONFIG_KIND_MISMATCH');
 if(typeof installation.host!=='string'||!installation.host)throw Error('RUNTIME_HOST_REQUIRED');
 return{runtimeTarget:installation.runtimeTarget,installRoot:installation.installRoot,currentReleaseFile:installation.currentReleaseFile,configFile:installation.configFile,host:installation.host,canonicalRoot:root,canonicalPointer:pointer,canonicalConfig:config};
}
export function assertRuntimeTarget({expectedTarget,release,installation,actualHost}){
 const spec=RUNTIME_TARGETS[expectedTarget];if(!spec)throw Error('RUNTIME_EXPLICIT_TARGET_REQUIRED');
 if(release?.kind!=='platform-backend')throw Error('RUNTIME_PACKAGE_KIND_REQUIRED');
 if(release.schema!=='vantemio.runtime-release/v1')throw Error('RUNTIME_RELEASE_SCHEMA_REQUIRED');
 if(release.runtimeTarget!==expectedTarget||installation?.runtimeTarget!==expectedTarget)throw Error('RUNTIME_TARGET_MISMATCH');
 if(release.packageName!==spec.packageName)throw Error('RUNTIME_PACKAGE_NAME_MISMATCH');
 if(!/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/u.test(release.version??''))throw Error('RUNTIME_RELEASE_VERSION_REQUIRED');
 for(const key of ['installRoot','currentReleaseFile','configFile'])if(Object.hasOwn(release,key))throw Error('RUNTIME_PACKAGE_CANNOT_CHOOSE_DESTINATION');
 const plan=installationPlan(installation);
 if(typeof actualHost!=='string'||actualHost.toLowerCase()!==plan.host.toLowerCase())throw Error('RUNTIME_HOST_MISMATCH');
 return Object.freeze({...plan,packageName:spec.packageName,version:release.version});
}
export function assertSeparateRuntimeInstallations(installations){
 if(!Array.isArray(installations)||!installations.length)throw Error('RUNTIME_INSTALLATIONS_REQUIRED');
 const plans=installations.map(installationPlan);
 for(let i=0;i<plans.length;i++)for(let j=0;j<i;j++){
  const a=plans[i],b=plans[j];if(a.host.toLowerCase()!==b.host.toLowerCase())continue;
  if(a.canonicalRoot===b.canonicalRoot||a.canonicalRoot.startsWith(b.canonicalRoot+'/')||b.canonicalRoot.startsWith(a.canonicalRoot+'/')||a.canonicalConfig===b.canonicalConfig||a.canonicalPointer===b.canonicalPointer)throw Error('RUNTIME_INSTALLATIONS_OVERLAP');
 }
 return plans;
}
export async function applyRuntimeRelease(options){
 const plan=assertRuntimeTarget(options);
 if(typeof options.apply!=='function')throw Error('RUNTIME_OWNED_APPLY_CALLBACK_REQUIRED');
 return options.apply(plan);
}
