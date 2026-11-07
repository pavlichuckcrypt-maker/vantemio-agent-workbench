import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as openCode from '../src/active-read-context.mjs';
import * as harness from '../src/harness-root-context.mjs';

const select = openCode.selectTaskDiagnosticOriginal ?? (() => null);
const project = harness.projectHarnessWorkingNotes ?? ((options) => options);
const sessionID = 'ses_fixture';
const recovery = (nativeCallID, owner = sessionID, status = 'completed') => ({
  info: {role: 'assistant', sessionID: owner},
  parts: [{type: 'tool', tool: 'studio_station_recover', state: {status, input: {nativeCallID, field: 'error'}}}]
});
const options = {
  sessionID, taskStart: 0, current: 'Repair the failed consumer',
  messages: [recovery('call_previous_test'), recovery('call_current_test'), recovery('call_foreign', 'ses_other'), recovery('call_live', sessionID, 'running')],
  recentFailures: [{tool: 'studio_station_exec', callID: 'call_unrelated_listing'}]
};

test('use the last completed own recovery locator before an unrelated shell error', () => {
  assert.equal(select(options), 'call_current_test');
});
test('honor an explicit current original and exclude pre-task or foreign observations', () => {
  assert.equal(select({...options, current: 'Repair call_assigned_test'}), 'call_assigned_test');
  assert.equal(select({...options, current: 'Repair call_first and call_second'}), null);
  assert.equal(select({...options, taskStart: 2, recentFailures: []}), null);
  assert.equal(select({...options, current: 'Read the updated current route'}), null);
});

const digest = text => createHash('sha256').update(text).digest('hex');
function harnessFixture() {
  const goal = {id:'goal_fixture',revision:3,phase:'active',activation:'armed'};
  const taskSHA256 = '1'.repeat(64);
  const event = {type:'assistant/message',seq:1,data:{turn:8,message:{content:[{type:'text',text:'The current caller is missing a guard.'}]}}};
  const text = event.data.message.content[0].text;
  const body = '[RECENT EXACT WORKING NOTES]\nQuoted history.\n'+JSON.stringify({
    schema:1,sessionID,goalID:goal.id,goalRevision:goal.revision,taskSHA256,nativeTurn:8,
    notes:[{seq:1,text,textSHA256:digest(text)}],quotedPublicHistory:true,sourceAuthority:false,productAcceptance:false
  });
  const note = {id:'note',role:'developer',source:{kind:'studio-working-notes-v1',sessionID,goalID:goal.id,goalRevision:goal.revision,taskSHA256,notesSHA256:digest(body)},content:[{type:'text',text:body}]};
  const events = [{type:'turn/start',seq:0,data:{turn:8}},event,{type:'developer/message',seq:2,data:{turn:8,message:note}}];
  const session = {id:sessionID,seq:events.length,surface:{nodes:[2]},eventAt:i=>events[i]};
  const opts = {sessionId:sessionID,model:'chosen-model',reasoningEffort:'high',maxTokens:10000,messages:[{role:'system',content:[{type:'text',text:'Existing root'}]},{role:'user',content:[{type:'text',text:'Original user'}]},note]};
  return {session,goal,taskSHA256,opts,events,body};
}
test('the native root assembler forwards one qualified notes block without changing controls', () => {
  const f=harnessFixture(), before=structuredClone(f.opts);
  const projected=project(f.opts,f);
  const result=harness.preserveNativeRoot(projected).options;
  assert.deepEqual(project(projected,f),projected);
  assert.match(result.messages[0].content[0].text,/current caller is missing a guard/);
  assert.equal(JSON.stringify(result.messages).split('[RECENT EXACT WORKING NOTES]').length,2);
  assert.equal(result.model,f.opts.model);
  assert.equal(result.maxTokens,10000);
  assert.deepEqual(f.opts,before);
});
test('notes with a stale goal, changed task, foreign session or changed original stay unpromoted', () => {
  const f=harnessFixture();
  assert.equal(project(f.opts,{...f,goal:{...f.goal,revision:4}}),f.opts);
  assert.equal(project(f.opts,{...f,goal:{...f.goal,phase:'paused'}}),f.opts);
  assert.equal(project(f.opts,{...f,taskSHA256:'2'.repeat(64)}),f.opts);
  assert.equal(project(f.opts,{...f,session:{...f.session,id:'foreign'}}),f.opts);
  f.events[1].data.message.content[0].text='Modified';
  assert.equal(project(f.opts,f),f.opts);
});
