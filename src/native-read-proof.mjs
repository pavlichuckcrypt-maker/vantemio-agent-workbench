import{createHash}from'node:crypto';import{isDeepStrictEqual}from'node:util';
const sha=x=>createHash('sha256').update(x).digest('hex');
// Only the actual host's readonly native store can authenticate these hints.
// Neither locations nor a supplied text alone establish tool completion.
export function nativeToolLocations(messages=[],sessionID,wanted=[]){
 const keep=new Set(wanted),locations=new Map(),ambiguous=new Set();
 for(const message of messages){if(message?.info?.sessionID!==sessionID||message.info.role!=='assistant'||typeof message.info.id!=='string')continue;
  for(const p of message.parts??[]){if(p.type!=='tool'||!keep.has(p.callID)||typeof p.id!=='string'||ambiguous.has(p.callID))continue;const loc={partID:p.id,messageID:message.info.id},old=locations.get(p.callID);if(old&&!isDeepStrictEqual(old,loc)){locations.delete(p.callID);ambiguous.add(p.callID);}else locations.set(p.callID,loc);}
 }
 return {locations:Object.fromEntries(locations),ambiguousCallIDs:[...ambiguous]};
}
export function matchNativeReadProofs(response,{sessionID,wanted=[],locations={},knownTexts={},allowedTools=[]}={}){
 const proofs=new Map(),unproven=[],wantedSet=new Set(wanted),allowed=new Set(allowedTools);
 if(response?.protocol!=='indexed-native-read-v2'||!Array.isArray(response.parts))return {proofs,unproven:wanted.map(callID=>({callID,reason:'native_metadata_protocol_unavailable'}))};
 const seen=new Set();
 for(const row of response.parts){
  const id=row?.callID,loc=Object.hasOwn(locations,id)?locations[id]:null,p=row?.nativePartWithoutOutput,a=row?.actionArchive,text=Object.hasOwn(knownTexts,id)?knownTexts[id]:undefined;
  if(!wantedSet.has(id))continue;
  if(seen.has(id)){proofs.delete(id);unproven.push({callID:id,reason:'ambiguous_native_metadata'});continue;}seen.add(id);
  if(!loc||p?.id!==loc.partID||p.messageID!==loc.messageID||p.sessionID!==sessionID||p.type!=='tool'||p.callID!==id||p.tool!==row.tool||!allowed.has(row.tool)||p.state?.status!=='completed'||Object.hasOwn(p.state,'output')||!isDeepStrictEqual(p.state.input??{},row.args)||row.messageID!==loc.messageID||a?.kind!=='actual_host_native_sqlite_readonly'||a.partID!==loc.partID||a.messageID!==loc.messageID||!/^[a-f0-9]{64}$/u.test(a.partSHA256??'')){
   unproven.push({callID:id,reason:'native_metadata_binding_mismatch'});continue;
  }
  if(typeof text!=='string'||!/^[a-f0-9]{64}$/u.test(row.outputSHA256??'')||sha(text)!==row.outputSHA256){unproven.push({callID:id,reason:'exact_known_original_text_unavailable'});continue;}
  proofs.set(id,{...row,text});
 }
 for(const id of wanted)if(!seen.has(id))unproven.push({callID:id,reason:'original_not_qualified_not_an_absence_or_effect_verdict'});
 return {proofs,unproven,metadataOnlyTransport:true,toolOrSourceAuthorityUnchanged:true};
}
// Classify only an exact local pre-dispatch failure after its fixed native
// release was authenticated by the host. The existing dispatcher still owns
// current-input admission, durable intent and the no-replay fence.
export function qualifyReadonlyProofRecovery({last,binding,event,sameRoot,hasUnsettledOriginals,release}={}){
 const no=reason=>({eligible:false,reason}),i=last?.info,b=binding,g=b?.goal,s=b?.sourceGoal;
 if(i?.error?.name!=='UnknownError'||i.error.data?.message!=='READ_BUDGET_NATIVE_PROOF_UNAVAILABLE'||!i.time?.completed)return no('not_exact_local_read_proof_failure');
 if(!b?.enabled||b.ownerStopped||event?.enabled===false||event?.ownerAbort||event?.accepted||!sameRoot||hasUnsettledOriginals!==false||['complete','completed','paused','stopped'].includes(s?.phase)||['complete','completed','paused','stopped'].includes(s?.status))return no('owner_stop_or_unsettled_original_preserved');
 if(!g?.id||g.id!==s?.id||g.revision!==s?.revision||typeof s.objective!=='string'||sha(s.objective)!==g.objectiveSHA256||i.providerID!==b.expectedProvider||i.modelID!==b.model)return no('current_native_goal_or_selection_mismatch');
 if((event?.dispatches??[]).some(x=>x.from===i.id)||(last.parts??[]).some(p=>p.type==='tool'||['text','reasoning'].includes(p.type)&&p.text))return no('original_dispatch_or_emission_preserved');
 if(release?.version!==2||!Number.isInteger(release.nativePID)||release.nativePID<1||release.nativePID!==release.currentPID||release.sourceVerified!==true||!/^[a-f0-9]{64}$/u.test(release.manifestSHA256??'')||release.manifestSHA256!==release.readyManifestSHA256||!release.entry||release.entry!==release.readyEntry)return no('fixed_native_release_not_verified');
 return{eligible:true,kind:'indexed_native_read_proof_upgrade',version:2,originalAssistantID:i.id,sourceManifestSHA256:release.manifestSHA256,nativePID:release.nativePID,oldProviderRequestSent:false,originalOperationReplay:false,sourceGoalSchemasClaimsStopAndUnknownUnchanged:true};
}
