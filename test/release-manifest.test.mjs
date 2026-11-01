import test from 'node:test';
import assert from 'node:assert/strict';
import {executionManifestView} from '../src/release-manifest.mjs';

const hash='a'.repeat(64);
const entry={source:'C:/backend/current.mjs',candidateSHA256:hash,purpose:'current module',originalSource:'C:/backend/old.mjs',originalSHA256:'b'.repeat(64)};
const manifest={buildRevision:1,newEntry:'file:///C:/backend/current.mjs',actors:{actor:{goal:{id:'goal',revision:1}}},files:[entry]};
const provenance={file:'receipts/full-manifest.json',sha256:hash};

test('preserves execution identities and operational fields without mutating provenance',()=>{
 const before=structuredClone(manifest),view=executionManifestView(manifest,provenance);
 assert.deepEqual(view.files,[{source:entry.source,candidateSHA256:hash,purpose:entry.purpose}]);
 assert.deepEqual(view.actors,manifest.actors);
 assert.equal(view.newEntry,manifest.newEntry);
 assert.equal(view.fullProvenanceManifest.sha256,hash);
 assert.deepEqual(manifest,before);
});
test('large archived descriptions do not consume execution registry budget',()=>{
 const view=executionManifestView({...manifest,files:[{...entry,originalSource:'archive/'.repeat(70000)}]},provenance);
 assert(Buffer.byteLength(JSON.stringify(view))<262144);
});
test('required execution metadata overflow is rejected before maintenance',()=>{
 const files=Array.from({length:3000},(_,i)=>({...entry,source:'C:/backend/'+i+'.mjs'}));
 assert.throws(()=>executionManifestView({...manifest,files},provenance),/EXECUTION_MANIFEST_BOUND_BEFORE_LOAD/);
});
test('invalid execution Source digest is rejected',()=>{
 assert.throws(()=>executionManifestView({...manifest,files:[{...entry,candidateSHA256:'invalid'}]},provenance),/SOURCE_MANIFEST_ENTRY_INVALID/);
});
test('conflicting identities for the same Source are rejected',()=>{
 assert.throws(()=>executionManifestView({...manifest,files:[entry,{...entry,candidateSHA256:'c'.repeat(64)}]},provenance),/SOURCE_MANIFEST_ENTRY_CONFLICT/);
});
test('a complete immutable provenance reference is required',()=>{
 assert.throws(()=>executionManifestView(manifest,{file:'full.json',sha256:'invalid'}),/SOURCE_MANIFEST_PROVENANCE_REQUIRED/);
});
