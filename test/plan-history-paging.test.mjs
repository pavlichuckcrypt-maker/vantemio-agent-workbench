import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {currentPlanObservation, pagePlanObservation} from '../src/current-plan-observation.mjs';

const hash = s => createHash('sha256').update(s).digest('hex');
const file = 'D:/demo/PLAN.md';
const observation = () => currentPlanObservation('Completed finding with evidence.\n'.repeat(400), file);
const archive = async text => ({file: '/demo/archive/' + hash(text) + '.json', sha256: hash(text)});

test('pages a historical display only after archiving exact observation bytes', async () => {
  const source = observation(), before = JSON.stringify(source), saved = [];
  const result = await pagePlanObservation(source, {expectedFile: file, currentGoalAndTodoInline: true,
    archive: async text => {saved.push(text); return archive(text);}});
  assert.equal(result.changed, true);
  assert.equal(saved[0], before);
  assert.equal(JSON.stringify(source), before);
  assert.equal(result.observation.sha256, source.sha256);
  assert.equal(result.observation.incomplete, true);
  assert.equal(result.observation.originalChars, source.originalChars);
  assert.equal(result.observation.archivedDisplay.sha256, hash(before));
  assert.equal('currentLocalText' in result.observation, false);
  assert.ok(JSON.stringify(result.observation).length < before.length / 3);
});

test('missing current task, wrong file, and native results are not paged', async () => {
  for (const [source, options] of [
    [observation(), {expectedFile: file}],
    [observation(), {expectedFile: 'D:/other/PLAN.md', currentGoalAndTodoInline: true}],
    [{...observation(), observationOnly: false}, {expectedFile: file, currentGoalAndTodoInline: true}],
    [currentPlanObservation('current: verify caller', file), {expectedFile: file, currentGoalAndTodoInline: true}],
  ]) {
    let writes = 0;
    const result = await pagePlanObservation(source, {...options, archive: async () => {writes++;}});
    assert.equal(result.changed, false);
    assert.equal(writes, 0);
    assert.deepEqual(result.observation, source);
  }
});

test('archive failure or mismatched identity cannot erase the display', async () => {
  for (const store of [async () => {throw Error('unavailable');}, async () => ({file: '/demo/wrong', sha256: '0'.repeat(64)})]) {
    const source = observation(), before = JSON.stringify(source);
    await assert.rejects(() => pagePlanObservation(source, {expectedFile: file, currentGoalAndTodoInline: true, archive: store}));
    assert.equal(JSON.stringify(source), before);
  }
});

test('a paged observation is idempotent and never creates another archive', async () => {
  const first = await pagePlanObservation(observation(), {expectedFile: file, currentGoalAndTodoInline: true, archive});
  let writes = 0;
  const second = await pagePlanObservation(first.observation, {expectedFile: file, currentGoalAndTodoInline: true, archive: async () => {writes++;}});
  assert.equal(second.changed, false);
  assert.equal(writes, 0);
  assert.deepEqual(second.observation, first.observation);
});
