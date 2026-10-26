import {createHash} from 'node:crypto';
const sha=value=>createHash('sha256').update(value).digest('hex');
// A precise native validation rejection, not a general exception-to-success rule.
export function knownNativeNoEffectFailure(part){
 const state=part?.state,input=state?.input,time=state?.time;
 if(part?.type!=='tool'||part.tool!=='edit'||!/^call_[A-Za-z0-9_-]+$/.test(part.callID||'')||state?.status!=='error'||state.error!=='No changes to apply: oldString and newString are identical.'||typeof input?.filePath!=='string'||!input.filePath.trim()||/[\0\r\n]/.test(input.filePath)||typeof input.oldString!=='string'||typeof input.newString!=='string'||input.oldString!==input.newString||!Number.isFinite(time?.start)||!Number.isFinite(time?.end)||time.start<=0||time.end<time.start)return null;
 return {status:'known_failed_before_execution',code:'NATIVE_EDIT_IDENTICAL_INPUT',operation:'edit',originalCallID:part.callID,originalInputSHA256:sha(JSON.stringify(input)),originalErrorSHA256:sha(state.error),originalCompletedAt:time.end,operationDispatched:false,noOperationReplay:true,noReleaseApproval:true};
}
