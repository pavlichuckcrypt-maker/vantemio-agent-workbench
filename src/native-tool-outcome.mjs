import {createHash} from 'node:crypto';
const sha=value=>createHash('sha256').update(value).digest('hex');
// A precise native validation rejection, not a general exception-to-success rule.
export function knownNativeNoEffectFailure(part){
 const state=part?.state,input=state?.input,time=state?.time;
 if(part?.type!=='tool'||part.tool!=='edit'||!/^call_[A-Za-z0-9_-]+$/.test(part.callID||'')||state?.status!=='error'||typeof input?.filePath!=='string'||!input.filePath.trim()||/[\0\r\n]/.test(input.filePath)||typeof input.oldString!=='string'||typeof input.newString!=='string'||!Number.isFinite(time?.start)||!Number.isFinite(time?.end)||time.start<=0||time.end<time.start)return null;
 let code;
 if(state.error==='No changes to apply: oldString and newString are identical.'&&input.oldString===input.newString)code='NATIVE_EDIT_IDENTICAL_INPUT';
 else if(state.error==='Found multiple matches for oldString. Provide more surrounding context to make the match unique.'&&input.oldString.length>0&&input.oldString!==input.newString&&(input.replaceAll===undefined||input.replaceAll===false)&&!state.output)code='NATIVE_EDIT_AMBIGUOUS_PREWRITE';
 else return null;
 return {status:'known_failed_before_execution',code,operation:'edit',originalCallID:part.callID,originalInputSHA256:sha(JSON.stringify(input)),originalErrorSHA256:sha(state.error),originalCompletedAt:time.end,operationDispatched:false,noOperationReplay:true,noReleaseApproval:true};
}
