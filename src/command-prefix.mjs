// Normalize only a caller-owned exact prologue, never command contents or execution history.
export function prefixCommandOnce(command,prefix) {
  if (typeof command!=='string' || typeof prefix!=='string' || !prefix.length) throw Error('EXACT_COMMAND_PREFIX_REQUIRED');
  while (command.startsWith(prefix)) command=command.slice(prefix.length);
  return prefix+command;
}
