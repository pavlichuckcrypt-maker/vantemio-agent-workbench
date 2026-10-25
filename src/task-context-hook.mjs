import path from 'node:path';
import {readCurrentTaskDocuments} from './current-task-documents.mjs';

const text = value => typeof value === 'string' && value.trim().length > 0;

function snapshot(task, sessionID) {
  const b = task?.binding;
  if (!b || !['actorID', 'sessionID', 'goalID', 'inputID'].every(key => text(b[key])) ||
      !(Number.isSafeInteger(b.revision) && b.revision >= 0) ||
      !text(task.workspaceRoot) || !path.isAbsolute(task.workspaceRoot) ||
      !text(task.fullGoal) || !text(task.projectContext) || typeof task.ownerStop !== 'boolean') {
    throw new Error('TASK_CONTEXT_INVALID_BINDING');
  }
  if (b.sessionID !== sessionID) throw new Error('TASK_CONTEXT_SESSION_MISMATCH');
  if (task.ownerStop) throw new Error('TASK_CONTEXT_OWNER_STOP');
  // Copy primitive values before awaiting; a resolver may return a mutable native object.
  return {
    actorID:b.actorID, sessionID:b.sessionID, goalID:b.goalID,
    revision:b.revision, inputID:b.inputID, workspaceRoot:task.workspaceRoot,
    fullGoal:task.fullGoal, projectContext:task.projectContext,
  };
}

// No scheduler, provider request, history rewrite or per-agent captured task text.
export function createTaskContextTransform({resolveTask, maxContextBytes} = {}) {
  if (typeof resolveTask !== 'function' || !Number.isSafeInteger(maxContextBytes) ||
      maxContextBytes < 1 || maxContextBytes > 1048576) {
    throw new Error('TASK_CONTEXT_INVALID_OPTIONS');
  }
  return async (input, output) => {
    if (!text(input?.sessionID) || !Array.isArray(output?.system) ||
        !output.system.every(value => typeof value === 'string')) {
      throw new Error('TASK_CONTEXT_INVALID_HOOK_IO');
    }
    const before = snapshot(await resolveTask(input), input.sessionID);
    const documents = await readCurrentTaskDocuments(before.workspaceRoot);
    const after = snapshot(await resolveTask(input), input.sessionID);
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('TASK_CONTEXT_CHANGED');
    // Per-request IDs are checked above, not injected into an otherwise stable prefix.
    const context = JSON.stringify({
      fullGoal:before.fullGoal, projectContext:before.projectContext, ...documents,
    });
    if (Buffer.byteLength(context, 'utf8') > maxContextBytes) throw new Error('TASK_CONTEXT_TOO_LARGE');
    output.system.push(context);
  };
}
