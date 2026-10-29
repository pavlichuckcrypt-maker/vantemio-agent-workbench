import {createHash} from 'node:crypto';
const sha=value=>createHash('sha256').update(value).digest('hex');
const originalIdentifier=value=>typeof value==='string'&&value.length>0&&value.length<=1024&&value.trim()===value&&!/[\x00-\x1f\x7f]/.test(value);
// A precise native validation rejection, not a general exception-to-success rule.
export function knownNativeNoEffectFailure(part){
 const state=part?.state,input=state?.input,time=state?.time;
 // OpenCode1.19.3 processor: input-start creates pending {input:{},raw:''};
 // tool-call replaces it with running and REMOVES raw before execution.
 // Cleanup of an untouched pending part assigns identical start/end. A
 // running/partially specified/provider-executed operation never matches.
 if(part?.type==='tool'&&['write','edit','apply_patch','bash','read'].includes(part.tool)&&originalIdentifier(part.callID)&&state?.status==='error'&&state.error==='Tool execution aborted'&&Object.hasOwn(state,'raw')&&state.raw===''&&input&&typeof input==='object'&&!Array.isArray(input)&&Object.keys(input).length===0&&state.metadata?.interrupted===true&&Object.keys(state.metadata).every(k=>k==='interrupted')&&part.metadata?.providerExecuted!==true&&Number.isFinite(time?.start)&&time.start>0&&time.end===time.start&&!state.output&&!state.attachments&&!state.title){
  return{status:'known_failed_before_execution',code:'NATIVE_EMPTY_TOOL_INPUT_ABORTED',operation:part.tool,originalCallID:part.callID,originalInputSHA256:sha(JSON.stringify(input)),originalErrorSHA256:sha(state.error),originalCompletedAt:time.end,operationDispatched:false,noOperationReplay:true,noReleaseApproval:true};
 }


 if(part?.type!=='tool'||part.tool!=='edit'||!originalIdentifier(part.callID)||state?.status!=='error'||typeof input?.filePath!=='string'||!input.filePath.trim()||/[\0\r\n]/.test(input.filePath)||typeof input.oldString!=='string'||typeof input.newString!=='string'||!Number.isFinite(time?.start)||!Number.isFinite(time?.end)||time.start<=0||time.end<time.start)return null;
 let code;
 if(state.error==='No changes to apply: oldString and newString are identical.'&&input.oldString===input.newString)code='NATIVE_EDIT_IDENTICAL_INPUT';
 else if(state.error==='Found multiple matches for oldString. Provide more surrounding context to make the match unique.'&&input.oldString.length>0&&input.oldString!==input.newString&&(input.replaceAll===undefined||input.replaceAll===false)&&!state.output)code='NATIVE_EDIT_AMBIGUOUS_PREWRITE';
 // OpenCode 1.19.3 EditTool calls replace() before permission/writeWithDirs.
 // Its exact no-match failure cannot mutate the file. Keep FAIL, not UNKNOWN.
 else if(state.error==='Could not find oldString in the file. It must match exactly, including whitespace, indentation, and line endings.'&&input.oldString.length>0&&input.oldString!==input.newString&&(input.replaceAll===undefined||typeof input.replaceAll==='boolean')&&!state.output&&!state.attachments&&!state.metadata?.diff&&!state.metadata?.filediff&&part.metadata?.providerExecuted!==true)code='NATIVE_EDIT_NO_MATCH_PREWRITE';
 else return null;
 return {status:'known_failed_before_execution',code,operation:'edit',originalCallID:part.callID,originalInputSHA256:sha(JSON.stringify(input)),originalErrorSHA256:sha(state.error),originalCompletedAt:time.end,operationDispatched:false,noOperationReplay:true,noReleaseApproval:true};
}
