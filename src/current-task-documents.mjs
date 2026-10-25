import {readFile} from 'node:fs/promises';
import path from 'node:path';

// Call from each request's system transform with the authoritative workspace root.
// Do not capture the return value once when enrolling a long-running worker.
export async function readCurrentTaskDocuments(root) {
  const [technicalContract, requirements] = await Promise.all([
    readFile(path.join(root, 'TECHNICAL_TASK.md'), 'utf8'),
    readFile(path.join(root, 'REQUIREMENTS.md'), 'utf8'),
  ]);
  return {technicalContract, requirements};
}
