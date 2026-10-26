import test from'node:test';import assert from'node:assert/strict';import{waitingFlashBlocksContinuation,transientProviderError,unsettledTool}from'../src/recovery-guards.mjs';
test('helper wait preserves qualified interrupted request recovery',()=>{assert.equal(waitingFlashBlocksContinuation({phase:'waiting_flash'}),true);assert.equal(waitingFlashBlocksContinuation({phase:'waiting_flash'},{retryableStream:true}),false)});
test('quota/key/unknown write remain blocked',()=>{assert.equal(transientProviderError('Unable to forward upstream stream'),true);for(const s of ['insufficient_quota','invalid_api_key','unsupported.model','Bad Request'])assert.equal(transientProviderError(s),false);assert.equal(unsettledTool({type:'tool',tool:'bash',state:{status:'error',error:'ORIGINAL_RESULT_UNKNOWN'}}),true)});


test('exact completed native provider deadline is transient; bare tool timeouts and aborts are not',()=>{
  assert.equal(transientProviderError(JSON.stringify({name:'UnknownError',data:{message:'The operation timed out.'}})),true);
  for(const error of ['The operation timed out.',{name:'MessageAbortedError',data:{message:'The operation timed out.'}},
    {name:'UnknownError',data:{message:'Tool execution timed out.'}},
    {name:'UnknownError',data:{message:'The operation timed out. invalid_api_key'}}])
    assert.equal(transientProviderError(typeof error==='string'?error:JSON.stringify(error)),false);
});
