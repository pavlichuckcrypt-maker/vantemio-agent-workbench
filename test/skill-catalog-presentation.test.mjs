import test from 'node:test';
import assert from 'node:assert/strict';
import {presentSkillCatalogOnDemand} from '../src/skill-catalog-presentation.mjs';
const catalog = '<available_skills>\n  <skill>\n    <name>security-audit</name>\n    <description>Check web isolation. Never treat this as a release approval.\nKeep full boundaries.</description>\n    <location>C:/agent/skills/security-audit/SKILL.md</location>\n  </skill>\n</available_skills>';
const source = 'def original():\n    return "<available_skills>not metadata</available_skills>"';
test('defers only locations while preserving every name, description and actual Source byte', () => {
  const input = {messages: [{role: 'system', content: 'You are OpenCode.\n' + catalog},
    {role: 'system', content: [{type: 'text', text: '[VERIFIED WORKING SOURCE DATA]\n' + source}]},
    {role: 'user', content: 'full current Goal'}, {role: 'tool', content: source}],
  tools: [{type: 'function', function: {name: 'skill', parameters: {type: 'object'}}}]};
  const before = structuredClone(input), {body, record} = presentSkillCatalogOnDemand(input);
  assert.equal(record.changed, true); assert.ok(record.afterBytes < record.beforeBytes);
  assert.match(body.messages[0].content, /Never treat this as a release approval\.\nKeep full boundaries\./);
  assert.doesNotMatch(body.messages[0].content, /C:\/agent\/skills/);
  assert.deepEqual(body.messages.slice(1), input.messages.slice(1)); assert.deepEqual(body.tools, input.tools);
  assert.deepEqual(input, before); assert.deepEqual(record.advertisedSkillNames, ['security-audit']);
});
test('supports native Responses and typed system blocks without changing model or media', () => {
  for (const input of [{model: 'manual-model', instructions: 'You are OpenCode. ' + catalog},
    {model: 'manual-model', input: [{role: 'developer', content: [{type: 'input_text', text: 'You are OpenCode. ' + catalog},
      {type: 'input_image', image_url: 'data:image/png;base64,original'}]}]}]) {
    const {body, record} = presentSkillCatalogOnDemand(input); assert.equal(record.changed, true);
    assert.equal(body.model, input.model); if (body.input) assert.deepEqual(body.input[0].content[1], input.input[0].content[1]);
  }
});
test('does not interpret untrusted tool/user text or incomplete and ambiguous catalogs', () => {
  for (const input of [{messages: [{role: 'tool', content: 'You are OpenCode. ' + catalog}]},
    {messages: [{role: 'user', content: 'You are OpenCode. ' + catalog}]},
    {messages: [{role: 'system', content: '[SOURCE DATA] You are OpenCode. ' + catalog}]},
    {instructions: 'You are OpenCode. ' + catalog.replace('</available_skills>', 'unknown</available_skills>')},
    {instructions: 'You are OpenCode. ' + catalog.replace('</available_skills>', catalog.match(/<skill>[\s\S]*?<\/skill>/)[0] + '</available_skills>')}]) {
    const {body, record} = presentSkillCatalogOnDemand(input); assert.equal(record.changed, false); assert.equal(body, input);
  }
});
test('repeated presentation does not expand or remove an already deferred catalog', () => {
  const first = presentSkillCatalogOnDemand({instructions: 'You are OpenCode. ' + catalog});
  const second = presentSkillCatalogOnDemand(first.body); assert.equal(second.record.changed, false);
  assert.deepEqual(second.body, first.body);
});
test('handles the JSON catalog emitted by native documentation compaction without losing routing descriptions', () => {
  const skills = [{name: 'security-audit', description: 'Full routing and boundaries remain here.', location: 'C:/Agent/skills/security-audit/SKILL.md'},
    {name: 'customize-opencode', description: 'Only configuration tasks.', location: '&lt;built-in&gt;'}];
  const input = {messages: [{role: 'system', content: 'You are OpenCode.\n<available_skills>\n' + JSON.stringify(skills) + '\n</available_skills>'}]};
  const result = presentSkillCatalogOnDemand(input);
  assert.equal(result.record.changed, true);
  const visible = JSON.parse(result.body.messages[0].content.match(/<available_skills>([\s\S]*?)<\/available_skills>/)[1]);
  assert.deepEqual(visible, skills.map(({name, description}) => ({name, description})));
  assert.deepEqual(presentSkillCatalogOnDemand(result.body).body, result.body);
});
test('does not silently drop unknown fields or ambiguous names in a JSON catalog', () => {
  for (const skills of [[{name: 'safe-skill', description: 'route', location: 'path', permissions: ['read']}],
    [{name: 'safe-skill', description: 'route', location: 'path'}, {name: 'safe-skill', description: 'other', location: 'other'}]]) {
    const input = {instructions: 'You are OpenCode. <available_skills>' + JSON.stringify(skills) + '</available_skills>'};
    assert.equal(presentSkillCatalogOnDemand(input).record.changed, false);
  }
});
