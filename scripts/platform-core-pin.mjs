export function qualifyPlatformCorePin({runtimeTarget,packageName,packageVersion,currentVersion,requestedVersion,files=[],lock}={}){
 const version=v=>typeof v==='string'&&/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u.test(v);
 if(!version(currentVersion)||!version(requestedVersion))throw Error('PLATFORM_CORE_VERSION_REQUIRED');
 if(currentVersion===requestedVersion)return{coreVersion:currentVersion,frozen:false};
 if(!lock)throw Error('FROZEN_PLATFORM_CORE_LOCK_REQUIRED');
 const validPath=p=>typeof p==='string'&&/^(?:src|config)\//u.test(p)&&!p.split('/').some(v=>!v||v==='.'||v==='..')&&!p.includes('\\');
 const validFiles=rows=>Array.isArray(rows)&&rows.length>0&&new Set(rows.map(r=>r?.path)).size===rows.length&&rows.every(r=>validPath(r?.path)&&/^[a-f0-9]{64}$/u.test(r?.sha256??''));
 if(lock.schema!=='vantemio.platform-core-source-lock/v1'||lock.runtimeTarget!==runtimeTarget||lock.packageName!==packageName||lock.packageVersion!==packageVersion||lock.coreVersion!==requestedVersion||!/^[a-f0-9]{40}$/u.test(lock.sourceCommit??'')||!/^[a-f0-9]{64}$/u.test(lock.payloadSHA256??'')||!validFiles(lock.files)||!validFiles(files))throw Error('FROZEN_PLATFORM_CORE_LOCK_INVALID');
 const pinned=new Map(lock.files.map(r=>[r.path,r.sha256]));
 if(files.length!==pinned.size||files.some(r=>pinned.get(r.path)!==r.sha256))throw Error('FROZEN_PLATFORM_CORE_SOURCE_CHANGED');
 return{coreVersion:requestedVersion,frozen:true,payloadSHA256:lock.payloadSHA256};
}
