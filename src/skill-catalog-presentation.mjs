// Progressive disclosure of catalog metadata, never editing installed skills,
// their descriptions, permissions, tool parameters, Goal, Source or history.
function compactNativeText(text) {
  if (typeof text !== 'string' || !/^You are OpenCode\b/i.test(text)) return {text, changed: false, names: []};
  const names = []; let changed = false;
  const next = text.replace(/<available_skills>([\s\S]*?)<\/available_skills>/g, (all, inner) => {
    if (inner.trim().startsWith('[')) {
      let catalog; try { catalog = JSON.parse(inner); } catch { return all; }
      if (!Array.isArray(catalog) || !catalog.length
          || catalog.some(entry => !entry || typeof entry !== 'object' || Array.isArray(entry)
            || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.name ?? '')
            || typeof entry.description !== 'string'
            || Object.keys(entry).some(key => !['name', 'description', 'location'].includes(key))
            || (Object.hasOwn(entry, 'location') && typeof entry.location !== 'string'))
          || new Set(catalog.map(entry => entry.name)).size !== catalog.length
          || !catalog.some(entry => Object.hasOwn(entry, 'location'))) return all;
      changed = true; names.push(...catalog.map(entry => entry.name));
      return '<available_skills>\n' + JSON.stringify(catalog.map(({name, description}) => ({name, description})))
        + '\n</available_skills>';
    }
    const expression = /<skill>\s*<name>([^<]+)<\/name>\s*<description>([\s\S]*?)<\/description>\s*<location>([\s\S]*?)<\/location>\s*<\/skill>/g;
    const entries = [...inner.matchAll(expression)];
    if (!entries.length || inner.replace(expression, '').trim()
        || entries.some(entry => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry[1]))
        || new Set(entries.map(entry => entry[1])).size !== entries.length) return all;
    changed = true; names.push(...entries.map(entry => entry[1]));
    return '<available_skills>' + entries.map(entry => '<skill><name>' + entry[1]
      + '</name><description>' + entry[2] + '</description></skill>').join('')
      + '</available_skills>';
  });
  return {text: next, changed, names};
}

export function presentSkillCatalogOnDemand(body) {
  const result = structuredClone(body), names = []; let changed = false;
  const project = text => {
    const value = compactNativeText(text); changed ||= value.changed;
    names.push(...value.names); return value.text;
  };
  if (typeof result.instructions === 'string') result.instructions = project(result.instructions);
  for (const key of ['messages', 'input']) if (Array.isArray(result[key])) {
    for (const message of result[key]) {
      if (!['system', 'developer'].includes(message.role)) continue;
      if (typeof message.content === 'string') message.content = project(message.content);
      else if (Array.isArray(message.content)) for (const item of message.content) {
        if (['text', 'input_text'].includes(item.type) && typeof item.text === 'string') item.text = project(item.text);
      }
    }
  }
  return {body: changed ? result : body, record: {version: 2, changed,
    advertisedSkillNames: [...new Set(names)], allDescriptionsPreserved: true,
    locationsResolvedByNativeSkillTool: true, noSourceOrGoalRemoval: true,
    beforeBytes: Buffer.byteLength(JSON.stringify(body)), afterBytes: Buffer.byteLength(JSON.stringify(result))}};
}
