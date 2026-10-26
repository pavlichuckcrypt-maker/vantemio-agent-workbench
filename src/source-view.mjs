import path from 'node:path';
import {realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const text = x => typeof x === 'string' && x.trim() && !x.includes('\0');
const key = p => process.platform === 'win32' ? p.toLowerCase() : p;
const equal = (a,b) => key(a) === key(b);
const inside = (root,file) => {
  const relative = path.relative(root,file);
  return relative !== '' && relative !== '..' && !relative.startsWith('..'+path.sep) && !path.isAbsolute(relative);
};
function absolute(p) {
  if (!text(p) || !path.isAbsolute(p) || p.split(/[\\/]/).includes('..')) throw Error('SOURCE_VIEW_ABSOLUTE_PATH_REQUIRED');
  return path.resolve(p);
}
function scope(value) {
  if (!value || !['actorID','sessionID','goalID'].every(k=>text(value[k])) ||
      !Number.isSafeInteger(value.revision) || value.revision<0) throw Error('SOURCE_VIEW_BINDING_REQUIRED');
  return Object.fromEntries(['actorID','sessionID','goalID','revision'].map(k=>[k,value[k]]));
}
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const proof = v => hash([v.binding,v.host,v.workspaceRoot,v.viewRoot,v.sourceRoot]);

// Existing host supplies the approved roots; parsing a Goal or a graph is not an authorization grant.
export async function qualifySourceView({binding,expectedHost,workspaceRoot,declaredSourceRoots,ownerStop,view}={}) {
  const current=scope(binding);
  if (typeof ownerStop!=='boolean') throw Error('SOURCE_VIEW_STOP_STATE_REQUIRED');
  if (ownerStop) throw Error('SOURCE_VIEW_OWNER_STOP');
  if (!text(expectedHost)||!view||view.schema!=='agent.source-view/v1'||
      !text(view.host)||view.host.toLowerCase()!==expectedHost.toLowerCase()||
      JSON.stringify(scope(view.binding))!==JSON.stringify(current)) throw Error('SOURCE_VIEW_HOST_OR_BINDING_CHANGED');
  if (!Array.isArray(declaredSourceRoots)||!declaredSourceRoots.length) throw Error('SOURCE_VIEW_DECLARED_ROOT_REQUIRED');
  const workspace=absolute(workspaceRoot),alias=absolute(view.viewRoot),source=absolute(view.sourceRoot);
  if (!inside(workspace,alias)) throw Error('SOURCE_VIEW_OUTSIDE_WORKSPACE');
  const declared=declaredSourceRoots.map(absolute);
  if (!declared.some(p=>equal(p,source))) throw Error('SOURCE_VIEW_UNDECLARED_ROOT');
  const [actualWorkspace,actualParent,actualAlias,actualSource,...actualDeclared]=await Promise.all([
    realpath(workspace),realpath(path.dirname(alias)),realpath(alias),realpath(source),...declared.map(p=>realpath(p)),
  ]);
  if ((!equal(actualParent,actualWorkspace)&&!inside(actualWorkspace,actualParent))||!equal(actualAlias,actualSource)||
      !actualDeclared.some(p=>equal(p,actualSource))) throw Error('SOURCE_VIEW_PHYSICAL_ROOT_CHANGED');
  const result={schema:'agent.qualified-source-view/v1',binding:Object.freeze(current),host:view.host,
    workspaceRoot:workspace,viewRoot:alias,sourceRoot:actualSource,
    readOnlyObservation:true,sourceOrClaimAuthority:false};
  result.rootProofSHA256=proof(result);
  return Object.freeze(result);
}

// Resolve only this approved local view. No discovery, mounting, byte read, write, lease or claim transfer.
export async function qualifySourceViewFile(view,filePath) {
  if (view?.schema!=='agent.qualified-source-view/v1'||view.readOnlyObservation!==true||
      view.sourceOrClaimAuthority!==false||view.rootProofSHA256!==proof(view)) throw Error('SOURCE_VIEW_PROOF_CHANGED');
  const requested=absolute(filePath);
  if (!inside(view.viewRoot,requested)) throw Error('SOURCE_VIEW_FILE_OUTSIDE_VIEW');
  const [currentRoot,actualFile]=await Promise.all([realpath(view.viewRoot),realpath(requested)]);
  if (!equal(currentRoot,view.sourceRoot)||!inside(view.sourceRoot,actualFile)) throw Error('SOURCE_VIEW_FILE_ESCAPES_ROOT');
  return actualFile;
}
