// Shared release producer utility. Complete provenance stays in its immutable
// artifact; execution admission needs the current Source identities and roles.
export function executionManifestView(manifest,provenance,{maxBytes=262144}={}){
 if(!manifest||typeof manifest!=='object'||!Array.isArray(manifest.files))throw Error('SOURCE_MANIFEST_ENTRY_INVALID');
 if(!provenance||typeof provenance.file!=='string'||!provenance.file||!/^[a-f0-9]{64}$/.test(provenance.sha256||''))throw Error('SOURCE_MANIFEST_PROVENANCE_REQUIRED');
 if(!Number.isSafeInteger(maxBytes)||maxBytes<1024)throw Error('EXECUTION_MANIFEST_BOUND_INVALID');
 const view=structuredClone(manifest),seen=new Map();
 view.files=view.files.map(record=>{
  if(!record||typeof record.source!=='string'||!record.source||!/^[a-f0-9]{64}$/.test(record.candidateSHA256||''))throw Error('SOURCE_MANIFEST_ENTRY_INVALID');
  const path=record.source.replaceAll('\\','/'),key=/^[A-Za-z]:\//.test(path)?path.toLowerCase():path,prior=seen.get(key);
  if(prior&&prior!==record.candidateSHA256)throw Error('SOURCE_MANIFEST_ENTRY_CONFLICT');
  seen.set(key,record.candidateSHA256);
  delete record.originalSource;delete record.originalSHA256;
  return record;
 });
 view.sourceManifestExecutionViewVersion=1;
 view.fullProvenanceManifest={file:provenance.file,sha256:provenance.sha256,sameExecutionFilesAndHashes:true};
 if(Buffer.byteLength(JSON.stringify(view))>=maxBytes)throw Error('EXECUTION_MANIFEST_BOUND_BEFORE_LOAD: retain required Source and reduce execution metadata before any hold or load');
 return view;
}
