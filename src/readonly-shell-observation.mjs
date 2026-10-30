import path from'node:path';
// Historical effect classification only. The host still authenticates the
// original outcome and enforces execution/admission. This function runs nothing.
export function readonlyShellObservation(command,{scopeRoots=[],workdir,caseInsensitiveScopes=false}={}){
 if(typeof command!=='string'||!command.trim()||command.length>8192||/[\x00-\x08\x0b-\x1f\x7f\r\n]/.test(command)||!Array.isArray(scopeRoots)||!scopeRoots.length)return false;
 const absolute=s=>s.startsWith('/')||/^[A-Za-z]:\//.test(s),norm=s=>s.replaceAll('\\','/').replace(/\/$/,'');
 if(scopeRoots.some(s=>typeof s!=='string'||!s||!absolute(norm(s))||s.split(/[\\/]/).some(x=>x==='.'||x==='..')))return false;
 const roots=scopeRoots.map(norm),fold=s=>caseInsensitiveScopes?s.toLowerCase():s;
 let base=typeof workdir==='string'?norm(workdir):null;
 const scoped=(value,glob=false)=>{
  if(typeof value!=='string'||!value||/[;&|<>$`~\x00\r\n]/.test(value))return false;
  let s=norm(value);if(s.split('/').some(x=>x==='..'))return false;
  if(!glob&&/[*?\[\]]/.test(s))return false;
  if(!absolute(s)){if(!base||!absolute(base)||s.startsWith('-')||s.includes(':'))return false;s=path.posix.join(base,s);}
  const v=fold(s);return roots.some(r=>v===fold(r)||v.startsWith(fold(r)+'/'));
 };
 if(base&&!scoped(base))return false;
 const stages=[];let argv=[],word='',active=false,quote=null;
 const flush=()=>{if(active){argv.push(word);word='';active=false;}};
 const finish=op=>{flush();if(!argv.length)return false;stages.push({argv,op});argv=[];return stages.length<=32;};
 for(let i=0;i<command.length;i++){
  const c=command[i];
  if(quote==="'"){if(c==="'")quote=null;else word+=c;continue;}
  if(quote==='"'){
   if(c==='"'){quote=null;continue;}if(c==='$'||c==='`')return false;
   if(c==='\\'&&/["\\$`]/.test(command[i+1]||'')){word+=command[++i];continue;}
   word+=c;continue;
  }
  if(c==='"'||c==="'"){quote=c;active=true;continue;}
  if(c==='\\'){if(!command[i+1])return false;word+=command[++i];active=true;continue;}
  if(/\s/.test(c)){flush();continue;}
  const redirect=command.slice(i).match(/^(?:2>&1|2>\s*\/dev\/null)(?=\s|[;|&]|$)/);
  if(redirect){if(active)return false;i+=redirect[0].length-1;continue;}
  if(c==='&'){if(command[i+1]!=='&'||!finish('&&'))return false;i++;continue;}
  if(c==='|'&&command[i+1]==='|'){if(!finish('||'))return false;i++;continue;}
  if(c===';'||c==='|'){if(command[i+1]===c||!finish(c))return false;continue;}
  if(/[<>$`(){}]/.test(c))return false;word+=c;active=true;
  if(argv.length>256)return false;
 }
 if(quote)return false;flush();if(argv.length)stages.push({argv,op:null});else if(stages.at(-1)?.op!==';')return false;
 let piped=false,reads=0;
 for(let si=0;si<stages.length;si++){
  const stage=stages[si];
  const[name,...args]=stage.argv;
  if(stage.op==='||'){
   const next=stages[si+1];
   if(name!=='cd'||!next||next.argv.length!==2||next.argv[0]!=='exit'||next.argv[1]!=='1'||![';',null].includes(next.op))return false;
  }
  if(name==='cd'){
   if(piped||stage.op==='|'||args.length!==1||args[0]==='-'||!scoped(args[0]))return false;
   base=absolute(norm(args[0]))?norm(args[0]):path.posix.join(base,norm(args[0]));
  }else if(name==='exit'){
   if(si===0||stages[si-1].argv[0]!=='cd'||stages[si-1].op!=='||'||args.length!==1||args[0]!=='1'||![';',null].includes(stage.op))return false;
  }else if(name==='echo'){
   if(piped||args.join(' ').length>1000)return false;
  }else if(name==='sed'){
   if(piped||args.length!==3||args[0]!=='-n'||!/^\d{1,7}(?:,\d{1,7})?p$/.test(args[1])||args[2].startsWith('-')||!scoped(args[2]))return false;reads++;
  }else if(name==='grep'){
   let i=0,flags='';
   while(/^-[rRInilEHhsvFw]+$/.test(args[i]||'')){flags+=args[i++];}
   while(/^--include=\*\.[A-Za-z0-9]+$/.test(args[i]||''))i++;
   const pattern=args[i++];if(!pattern||pattern.startsWith('-'))return false;
   const files=[];
   for(;i<args.length;i++){if(/^--include=\*\.[A-Za-z0-9]+$/.test(args[i]))continue;if(args[i].startsWith('-'))return false;files.push(args[i]);}
   if(piped){if(files.length||/[rR]/.test(flags))return false;}
   else{if(!files.length||files.length>8||!files.every(x=>scoped(x,true)))return false;reads++;}
  }else if(name==='head'||name==='tail'){
   let i=0;if(/^-[1-9][0-9]{0,3}$/.test(args[i]||''))i++;
   else if(['-n','-c'].includes(args[i])&&/^[1-9][0-9]{0,3}$/.test(args[i+1]||''))i+=2;
   const files=args.slice(i);if(files.some(x=>x.startsWith('-')||!scoped(x)))return false;
   if(!piped&&!files.length)return false;if(piped&&files.length)return false;if(files.length)reads++;
  }else if(name==='sha256sum'){
   if(piped||!args.length||args.length>8||args.some(x=>x.startsWith('-')||!scoped(x)))return false;reads++;
  }else if(name==='find'){
   if(piped||!scoped(args[0]))return false;
   // Historical effect classification, not admission or a scan cost limit.
   // Pure predicates/default stdout do not become writes without maxdepth.
   for(let i=1;i<args.length;i++){
    const option=args[i];
    if(['-o','-or','-a','-and','-not','!','-print','-print0','-prune','-empty','-readable','-writable','-executable','-true','-false','-ls'].includes(option))continue;
    if(['-maxdepth','-mindepth'].includes(option)){if(!/^\d{1,9}$/.test(args[++i]||''))return false;continue;}
    if(option==='-type'){if(!/^[fdlpsbc]$/.test(args[++i]||''))return false;continue;}
    if(['-name','-iname','-path','-ipath','-regex','-iregex','-printf'].includes(option)){if(typeof args[++i]!=='string'||!args[i]||args[i].length>2000)return false;continue;}
    return false;
   }
   reads++;
  }else if(name==='wc'||name==='ls'){
   if(piped&&name==='ls')return false;let i=0;const flag=name==='wc'?/^-[lcw]+$/:/^-[al1dFhLrSt]+$/;
   while(flag.test(args[i]||''))i++;const files=args.slice(i);if(files.some(x=>x.startsWith('-')||!scoped(x,true)))return false;
   if(piped&&files.length)return false;if(!piped&&!files.length&&(!base||!scoped(base)))return false;if(!piped)reads++;
  }else return false;
  piped=stage.op==='|';
 }
 return !piped&&reads>0;
}
