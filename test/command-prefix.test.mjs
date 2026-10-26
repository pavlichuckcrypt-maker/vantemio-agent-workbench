import test from 'node:test';
import assert from 'node:assert/strict';
import {prefixCommandOnce} from '../src/command-prefix.mjs';

test('a backend prologue stays idempotent when the model reuses an already prepared command',()=>{
  const prefix='[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); $OutputEncoding = [Console]::OutputEncoding; ';
  const command="Get-Content -LiteralPath 'module.mjs'";
  for(const copies of [0,1,2,5]) assert.equal(prefixCommandOnce(prefix.repeat(copies)+command,prefix),prefix+command);
  const once=prefixCommandOnce(command,prefix);
  assert.equal(prefixCommandOnce(once,prefix),once);
});

test('only the exact leading prologue is normalized; quoted interior code stays untouched',()=>{
  const prefix='owned-prefix; ', command="Write-Output 'owned-prefix; owner text'";
  assert.equal(prefixCommandOnce(command,prefix),prefix+command);
  assert.equal(prefixCommandOnce(' other-prefix; '+command,prefix),prefix+' other-prefix; '+command);
  assert.throws(()=>prefixCommandOnce(command,''),/EXACT_COMMAND_PREFIX_REQUIRED/);
});
