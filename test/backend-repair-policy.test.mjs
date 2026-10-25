import test from 'node:test';
import assert from 'node:assert/strict';
import {nextAttempt,finishAttempt} from '../src/backend-repair-policy.mjs';
test('three changed failed candidates require arbitration, unchanged reruns do not spend another attempt',()=>{
 let s={operations:{},failures:0};
 for(let i=1;i<=3;i++){
  assert.equal(nextAttempt(s,{operationID:'op'+i,sourceSHA256:'s'+i}).action,'run');
  s=finishAttempt(s,{operationID:'op'+i,sourceSHA256:'s'+i,status:'FAIL',exitCode:1,receipt:'r'+i});
  assert.equal(nextAttempt(s,{operationID:'op'+i,sourceSHA256:'s'+i}).action,'original');
  assert.equal(nextAttempt(s,{operationID:'other'+i,sourceSHA256:'s'+i}).action,i===3?'arbitration':'hold');
 }
 assert.equal(nextAttempt(s,{operationID:'op4',sourceSHA256:'s4'}).action,'arbitration');
});
test('unknown original execution cannot be replayed or bypassed with a new ID',()=>{
 let s=finishAttempt({operations:{},failures:0},{operationID:'u',sourceSHA256:'a',status:'UNKNOWN',receipt:'intent'});
 assert.equal(nextAttempt(s,{operationID:'u',sourceSHA256:'a'}).action,'original');
 assert.equal(nextAttempt(s,{operationID:'new',sourceSHA256:'b'}).reason,'reconcile_original_unknown');
 assert.equal(s.failures,0);
});
test('success is test evidence only and duplicate completion does not count twice',()=>{
 let s=finishAttempt({operations:{},failures:1},{operationID:'ok',sourceSHA256:'a',status:'PASS',exitCode:0,receipt:'r'});
 assert.equal(s.status,'tests_passed_not_integrated');
 assert.equal(s.failures,0);
 assert.deepEqual(finishAttempt(s,{operationID:'ok',sourceSHA256:'a',status:'FAIL',exitCode:1}),s);
});
