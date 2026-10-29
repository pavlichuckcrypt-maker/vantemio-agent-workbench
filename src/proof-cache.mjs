const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
export function stableOriginalTransportResult(result){
 const value=structuredClone(result);
 // These describe delivery/cleanup observations, not the signed operation's
 // outcome. They can change after ACK and must not conflict with its receipt.
 for(const key of['responseCleanupConfirmed','requestTransport','responseTransport','controlAddress','controlVerification','controlTransportVersion','requestBytes','responseBytes'])delete value[key];
 return canonical(value);
}
// A cache capacity is not a RAM reservation. Durable original receipts remain
// on disk; evicting a proof only causes local re-verification, never replay.
export function createBoundedProofCache({maxBytes=16*1024*1024,maxEntries=512}={}){
 if(!Number.isSafeInteger(maxBytes)||maxBytes<1||!Number.isSafeInteger(maxEntries)||maxEntries<1)throw Error('INVALID_PROOF_CACHE_CAPACITY');
 const values=new Map();let bytes=0;
 const drop=key=>{const old=values.get(key);if(!old)return false;bytes-=old.bytes;return values.delete(key)};
 return{has:key=>values.has(key),get:key=>{const x=values.get(key);if(!x)return;values.delete(key);values.set(key,x);return structuredClone(x.value)},set:(key,value)=>{const copy=structuredClone(value),serialized=JSON.stringify(copy);if(serialized===undefined)throw Error('JSON_PROOF_REQUIRED');const size=Buffer.byteLength(serialized);drop(key);if(size>maxBytes)return false;while(values.size&&(bytes+size>maxBytes||values.size>=maxEntries))drop(values.keys().next().value);values.set(key,{value:copy,bytes:size});bytes+=size;return true},delete:drop,keys:()=>values.keys(),get size(){return values.size},stats:()=>({bytes,entries:values.size,maxBytes,maxEntries,durableOriginalsUnchanged:true})};
}
