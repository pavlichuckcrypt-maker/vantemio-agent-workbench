// Presentation only. The host must authenticate/bind the original result.
// A file digest and a completed read operation do not imply whole-file coverage.
export function deriveReadCoverage({output,totalLines,sourceSHA256}={}){
 if(typeof output!=='string'||output.length>34*1024*1024||!Number.isSafeInteger(totalLines)||totalLines<0||!/^[a-f0-9]{64}$/.test(sourceSHA256||''))return null;
 const frame=/^<path>[^\r\n]+<\/path>\r?\n<type>file<\/type>\r?\n<content>\r?\n([\s\S]*?)\r?\n<\/content>(?:\r?\n|$)/.exec(output);
 if(!frame)return null;
 const rows=frame[1]?frame[1].split(/\r?\n/):[],numbers=[];
 for(const row of rows){const m=/^([1-9]\d*):(?: |$)/.exec(row);if(!m)return null;const n=Number(m[1]);if(!Number.isSafeInteger(n)||n>totalLines||(numbers.length&&n!==numbers.at(-1)+1))return null;numbers.push(n);}
 const first=numbers[0],last=numbers.at(-1),coversWholeFile=totalLines===0||first===1&&last===totalLines&&numbers.length===totalLines,unobservedRanges=[];
 if(!numbers.length&&totalLines)unobservedRanges.push([1,totalLines]);
 else{if(first>1)unobservedRanges.push([1,first-1]);if(last<totalLines)unobservedRanges.push([last+1,totalLines]);}
 return{version:1,sourceSHA256,originalTotalLines:totalLines,originalReturnedRange:numbers.length?[first,last]:null,returnedLineCount:numbers.length,coversWholeFile,eofObserved:totalLines===0||last===totalLines,unobservedRanges,observationOnly:true,noReleaseOrCompleteAuditAuthority:true};
}
