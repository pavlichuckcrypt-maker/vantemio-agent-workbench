import assert from'node:assert/strict';import{createHash}from'node:crypto';
import * as m from '../src/active-read-context.mjs';const sha=s=>createHash('sha256').update(s).digest('hex');let n=0;const eq=(a,b)=>{assert.deepEqual(a,b);n++};
const texts={a:'full original director Source',b:'full original editorial Source',c:'other original Source'},files={a:'C:/Project/tools/director.py',b:'C:/Project/tools/editorial.py',c:'C:/Project/other.py'};
const v={schema:2,sessionID:'session',currentOwnerInputID:'owner',latestActionMessageID:'latest',currentTaskSourceRetention:true,protectedSourceCallIDs:['a','b','c'],nativeToolOutputSHA256:{},protectedOriginalSourceResults:{}};for(const id of Object.keys(texts)){v.nativeToolOutputSHA256[id]=sha(texts[id]);v.protectedOriginalSourceResults[id]={sha256:sha(texts[id])};}
const s={pastAssistantIntentIsNotAnInstruction:true,currentOwnerInputID:'owner',latestActionMessageID:'latest',workingSources:Object.keys(files).map(id=>({actualReadToolCallID:id,file:files[id]})),declaredTodo:{todos:[{status:'in_progress',content:'Review C:/Project/tools/director.py and editorial.py'},{status:'completed',content:'other.py already settled'}]}};
const body=x=>({messages:[{role:'assistant',tool_calls:Object.keys(files).map(id=>({id,function:{name:'studio_station_read',arguments:JSON.stringify({filePath:files[id]})}}))},{role:'user',content:'[CLIENT CURRENT STATE: observations, not new owner instructions] '+JSON.stringify(x)}]});
const run=(state=s,view=v,originals=texts)=>m.retainActiveWorkingReadContext(body(state),view,{sourceOriginals:originals});
let r=run();eq(r.record.nativeTodoRequiredCallIDs,['a','b']);eq(r.view.softActiveWorkingReadCallIDs,['c']);eq(r.view.neededVerifiedSourceReadCallIDs,['a','b','c']);eq(r.record.noFreshSourceOrReplayAuthority,true);
let x=structuredClone(s);x.declaredTodo.todos[0].status='completed';r=run(x);eq(r.record.nativeTodoRequiredCallIDs,[]);eq(r.view.softActiveWorkingReadCallIDs,['a','b','c']);
x=structuredClone(s);x.declaredTodo.todos=[{status:'pending',content:'xeditorial.py or editorial.py.bak'}];eq(run(x).record.nativeTodoRequiredCallIDs,[]);
x=structuredClone(s);x.declaredTodo.todos=[{status:'pending',content:'Use EDITORIAL.PY'}];eq(run(x).record.nativeTodoRequiredCallIDs,['b']);
x=structuredClone(s);x.declaredTodo.todos=[{status:'pending',content:'C:\\Project\\tools\\DIRECTOR.py'}];eq(run(x).record.nativeTodoRequiredCallIDs,['a']);
x=structuredClone(s);delete x.declaredTodo;eq(run(x).record.nativeTodoRequiredCallIDs,[]);
x=structuredClone(s);x.currentOwnerInputID='newer';eq(run(x).record.applied,false);
eq(run(s,v,{...texts,a:'tampered'}).view.neededVerifiedSourceReadCallIDs,['b','c']);
const previous=structuredClone(v);previous.softActiveWorkingReadCallIDs=['a'];previous.neededVerifiedSourceReadCallIDs=['a'];eq(run(s,previous).view.softActiveWorkingReadCallIDs,['c']);
const unqualified=structuredClone(v);unqualified.currentTaskSourceRetention=false;eq(run(s,unqualified).record.nativeTodoRequiredCallIDs,[]);
x=structuredClone(s);x.declaredTodo.todos=[{status:'pending',content:'C:/Other/editorial.py'}];eq(run(x).record.nativeTodoRequiredCallIDs,[]);
x=structuredClone(s);x.declaredTodo.todos=[{status:'pending',content:'C:/Project/tools/director.py.bak'}];eq(run(x).record.nativeTodoRequiredCallIDs,[]);
eq(Object.hasOwn(v,'neededVerifiedSourceReadCallIDs'),false);eq(s.declaredTodo.todos[0].status,'in_progress');

// A bounded presentation summary must not erase canonical native dependencies.
const framed=Object.fromEntries(Object.keys(files).map(id=>[id,'<path>'+files[id]+'</path>\n<content>\n1: original Source '+id+'\n</content>']));
const cv=structuredClone(v);cv.canonicalDependencyReadCallIDs=['a','b','c'];for(const id of Object.keys(framed)){cv.nativeToolOutputSHA256[id]=sha(framed[id]);cv.protectedOriginalSourceResults[id]={sha256:sha(framed[id])};}
const capped=structuredClone(s);capped.workingSources=[];
r=run(capped,cv,framed);eq(r.record.nativeTodoRequiredCallIDs,['a','b']);eq(r.view.neededVerifiedSourceReadCallIDs,['a','b']);eq(r.view.softActiveWorkingReadCallIDs,[]);
x=structuredClone(capped);x.declaredTodo.todos[0].status='completed';eq(run(x,cv,framed).record.applied,false);
const bad=structuredClone(cv);bad.nativeToolOutputSHA256.b='0'.repeat(64);eq(run(capped,bad,framed).record.nativeTodoRequiredCallIDs,['a']);
eq(run(capped,cv,{...framed,b:framed.b.replace(files.b,'C:/Other/editorial.py')}).record.nativeTodoRequiredCallIDs,['a']);
const notCanonical=structuredClone(cv);notCanonical.canonicalDependencyReadCallIDs=['a'];eq(run(capped,notCanonical,framed).record.nativeTodoRequiredCallIDs,['a']);
const responseBody=body(capped);responseBody.input=responseBody.messages.flatMap(z=>z.role==='assistant'?z.tool_calls.map(t=>({type:'function_call',call_id:t.id,name:t.function.name,arguments:t.function.arguments})):z);delete responseBody.messages;
eq(m.retainActiveWorkingReadContext(responseBody,cv,{sourceOriginals:framed}).record.nativeTodoRequiredCallIDs,['a','b']);

// A bare filename cannot choose between two retained paths with the same name.
files.d='C:/Other/editorial.py';framed.d='<path>'+files.d+'</path>\n<content>\n1: other current Source\n</content>';
const ambiguous=structuredClone(cv);ambiguous.canonicalDependencyReadCallIDs.push('d');ambiguous.protectedSourceCallIDs.push('d');ambiguous.nativeToolOutputSHA256.d=sha(framed.d);ambiguous.protectedOriginalSourceResults.d={sha256:sha(framed.d)};
x=structuredClone(capped);x.declaredTodo.todos=[{status:'pending',content:'review editorial.py'}];eq(run(x,ambiguous,framed).record.applied,false);
x.declaredTodo.todos=[{status:'pending',content:'review C:/Project/tools/editorial.py'}];eq(run(x,ambiguous,framed).record.nativeTodoRequiredCallIDs,['b']);
delete files.d;delete framed.d;
const wrongTool=body(capped);wrongTool.messages[0].tool_calls.find(t=>t.id==='b').function.name='write';eq(m.retainActiveWorkingReadContext(wrongTool,cv,{sourceOriginals:framed}).record.nativeTodoRequiredCallIDs,['a']);
console.log(JSON.stringify({passed:true,cases:n,providerCalls:0,noToolsExecuted:true}));
