const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const qualified = snapshot => object(snapshot) && snapshot.authority === false &&
 snapshot.sourceOrJobAdoption === false && Array.isArray(snapshot.rows) && snapshot.rows.every(object);
const unavailable = snapshot => object(snapshot) && typeof snapshot.host === 'string' && snapshot.host.length > 0 &&
 snapshot.status === 'observation_unavailable' && snapshot.authority === false && snapshot.claimsReleased === false &&
 (snapshot.sourceOrJobAdoption === undefined || snapshot.sourceOrJobAdoption === false) && !Object.hasOwn(snapshot, 'rows');
const pick = (value, keys) => Object.fromEntries(keys.filter(key => Object.hasOwn(value, key)).map(key => [key, value[key]]));

// This projects a display only. The host must archive the complete original
// before using a changed view; it grants no liveness, Source or replay authority.
export function projectPeerResumeSnapshots(snapshots, {sessionID} = {}) {
 const unchanged = {changed: false, snapshots};
 if (typeof sessionID !== 'string' || !sessionID || !Array.isArray(snapshots) ||
     !snapshots.every(snapshot => qualified(snapshot) || unavailable(snapshot))) return unchanged;
 const projected = snapshots.map(snapshot => {
  if (unavailable(snapshot)) return snapshot;
  return {...snapshot, rows: snapshot.rows.map(row => {
   const result = pick(row, ['key', 'sessionID', 'ownerStopped', 'claimsReleased', 'sourceAdmission', 'liveStatus']);
   if (row.sessionID === sessionID) {
    Object.assign(result, pick(row, ['backendTask', 'recentPeerAction', 'workingOutputs']));
    if (Array.isArray(row.clientDocumentNavigation)) {
     if (!row.clientDocumentNavigation.every(object)) return row;
     result.clientDocumentNavigation = row.clientDocumentNavigation.map(value => pick(value, ['name', 'path', 'sha256']));
    }
    if (result.workingOutputs?.files?.length === 0 && !result.workingOutputs.nextConsumer) delete result.workingOutputs;
   }
   return result;
  })};
 });
 return JSON.stringify(projected) === JSON.stringify(snapshots) ? unchanged : {changed: true, snapshots: projected};
}
