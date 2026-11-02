// Presentation facts only. The host still authenticates original receipts and
// owns task/Goal, source freshness, CAS, Stop and effect acceptance.
const normal=s=>s.replaceAll('\\','/').toLowerCase();
export function stationReadEnvelope({text,callID,filePath}={}){
 if(typeof text!=='string'||typeof filePath!=='string')return null;
 const body=text.replace(/\s*<dcp-message-id>[A-Za-z0-9_-]+<\/dcp-message-id>\s*$/u,'').trimEnd();
 const receipts=[...body.matchAll(/\[STATION_NATIVE_RESULT request=([a-f0-9-]{36}) receipt=([^\r\n]+?) sha256=([a-f0-9]{64})\]/gu)],receipt=receipts.at(-1);
 if(!receipt)return null;
 const snapshots=[...body.matchAll(/\[STATION_SOURCE_SNAPSHOT path=([^\r\n]+?) sha256=([a-f0-9]{64}) actualReadCompleted=true;/gu)],snapshot=snapshots.at(-1);
 const frame=/^<path>([^\r\n<]+)<\/path>\r?\n<type>file<\/type>\r?\n<content>\r?\n([\s\S]*?)\r?\n<\/content>(?:\r?\n|$)/u.exec(body);
 if(!snapshot||snapshot.index>=receipt.index||snapshot[2]!==receipt[3]||normal(snapshot[1])!==normal(filePath)||!frame||normal(frame[1])!==normal(filePath))return null;
 const numbers=[];
 for(const row of frame[2]?frame[2].split(/\r?\n/u):[]){const m=/^([1-9]\d*):(?: |$)/u.exec(row);if(!m)return null;const n=Number(m[1]);if(!Number.isSafeInteger(n)||numbers.length&&n!==numbers.at(-1)+1)return null;numbers.push(n);}
 const range=numbers.length?[numbers[0],numbers.at(-1)]:null;
 const tail=body.slice(receipt.index+receipt[0].length).trim();
 let coverage=null;
 if(tail){
  const m=/^\[STATION_READ_COVERAGE_V1 (\{[^\r\n]*\})\]$/u.exec(tail);if(!m)return null;
  try{coverage=JSON.parse(m[1]);}catch{return null;}
  if(typeof callID!=='string'||coverage.originalCallID!==callID||coverage.originalRequestID!==receipt[1]||coverage.version!==1||coverage.sourceSHA256!==receipt[3]||!Number.isSafeInteger(coverage.originalTotalLines)||coverage.originalTotalLines<0||coverage.observationOnly!==true||coverage.noReleaseOrCompleteAuditAuthority!==true)return null;
  const fetched=coverage.originalReturnedRange;
  if(fetched===null){if(range!==null||coverage.returnedLineCount!==0)return null;}
  else if(!Array.isArray(fetched)||fetched.length!==2||!fetched.every(Number.isSafeInteger)||fetched[0]<1||fetched[1]<fetched[0]||fetched[1]>coverage.originalTotalLines||coverage.returnedLineCount!==fetched[1]-fetched[0]+1||!range||range[0]<fetched[0]||range[1]>fetched[1])return null;
 }
 return {sourceSHA256:receipt[3],requestID:receipt[1],receiptPath:receipt[2],receiptIndex:receipt.index,sourceRange:range,originalTotalLines:coverage?.originalTotalLines??null,originalFetchedRange:coverage?.originalReturnedRange??null,fullFetchedPageDisplayed:coverage?JSON.stringify(range)===JSON.stringify(coverage.originalReturnedRange):null,coverageFooterAccepted:!!coverage,sourceSnapshotNotFreshCAS:true,readIsNotAuditAcceptance:true};
}
export function summarizeSourceRanges(entries=[]){
 const groups=new Map();
 for(const e of entries){
  const range=e?.sourceRows,hash=e?.observedSourceSHA256;
  if(typeof e?.file!=='string'||!/^[a-f0-9]{64}$/u.test(hash??'')||!Array.isArray(range)||range.length!==2||!range.every(Number.isSafeInteger)||range[0]<1||range[1]<range[0]||typeof e.originalReadCallID!=='string')continue;
  const file=normal(e.file),key=file+'|'+hash,g=groups.get(key)??{file,observedSourceSHA256:hash,ranges:[],totals:new Set(),ids:new Set()};
  g.ranges.push(range);if(Number.isSafeInteger(e.originalTotalLines)&&e.originalTotalLines>=range[1])g.totals.add(e.originalTotalLines);g.ids.add(e.originalReadCallID);groups.set(key,g);
 }
 return [...groups.values()].sort((a,b)=>a.file.localeCompare(b.file)||a.observedSourceSHA256.localeCompare(b.observedSourceSHA256)).map(g=>{
  const availableRows=[];for(const [a,b]of g.ranges.sort((a,b)=>a[0]-b[0]||a[1]-b[1])){const prior=availableRows.at(-1);if(prior&&a<=prior[1]+1)prior[1]=Math.max(prior[1],b);else availableRows.push([a,b]);}
  const total=g.totals.size===1&&[...g.totals][0]>=availableRows.at(-1)[1]?[...g.totals][0]:null;let missingFetchedRows=null;
  if(total!==null){missingFetchedRows=[];let start=1;for(const[a,b]of availableRows){if(a>start)missingFetchedRows.push([start,a-1]);start=b+1;}if(start<=total)missingFetchedRows.push([start,total]);}
  return {file:g.file,observedSourceSHA256:g.observedSourceSHA256,availableRows,originalTotalLines:total,missingFetchedRows,wholeFileFetched:missingFetchedRows?.length===0,originalReadCallIDs:[...g.ids].sort(),auditComplete:false,sourceSnapshotNotFreshCAS:true,actualDisplayedCoverageUnknown:true};
 });
}
