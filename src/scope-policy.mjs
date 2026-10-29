import {createHash} from 'node:crypto';
const digest=value=>createHash('sha256').update(value).digest('hex');
/** Qualify one trusted host-extracted owner directive, not unrelated document bytes.
 * This proof alone grants no permissions or Goal/Source authority.
 */
export function qualifyOwnerScopeClause({policyText,expectedClauseSHA256,extractClause,maxClauseBytes=8192}={}){
 if(typeof policyText!=='string'||typeof extractClause!=='function')throw Error('TRUSTED_HOST_SCOPE_EXTRACTOR_REQUIRED');
 if(!/^[a-f0-9]{64}$/u.test(expectedClauseSHA256??'')||!Number.isSafeInteger(maxClauseBytes)||maxClauseBytes<1)throw Error('QUALIFIED_SCOPE_DIGEST_REQUIRED');
 let clause;try{clause=extractClause(policyText);}catch{return {qualified:false,reason:'scope_extraction_failed',ownerAuthorityNotInferred:true};}
 if(typeof clause!=='string'||!clause.trim())return {qualified:false,reason:'scope_missing_or_ambiguous',ownerAuthorityNotInferred:true};
 // Preserve case: a host may enforce case-sensitive paths. Normalize layout only.
 const normalized=clause.replace(/\s+/gu,' ').trim();
 if(Buffer.byteLength(normalized)>maxClauseBytes)return {qualified:false,reason:'scope_clause_oversize',ownerAuthorityNotInferred:true};
 const clauseSHA256=digest(normalized);
 return {qualified:clauseSHA256===expectedClauseSHA256,reason:clauseSHA256===expectedClauseSHA256?'same_owner_scope_clause':'scope_clause_changed',clauseSHA256,documentSHA256:digest(policyText),ownerAuthorityNotInferred:true};
}
