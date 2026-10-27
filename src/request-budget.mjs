import{readFile}from'node:fs/promises';
export function validateRequestBudget(policy){
 const maxInputTokens=policy.maxInputTokens,maxSerializedTextBytes=policy.maxSerializedTextBytes,
 maxFreshInputTokens=policy.maxFreshInputTokens,maxCachedInputTokens=policy.maxCachedInputTokens,
 targetFreshInputTokens=policy.targetFreshInputTokens??maxFreshInputTokens;
 if(!Number.isSafeInteger(maxInputTokens)||maxInputTokens<1||maxInputTokens>80000||maxSerializedTextBytes!==1048576||
 !Number.isSafeInteger(maxFreshInputTokens)||maxFreshInputTokens<1||maxFreshInputTokens>50000||maxFreshInputTokens>maxInputTokens||
 !Number.isSafeInteger(maxCachedInputTokens)||maxCachedInputTokens<0||maxCachedInputTokens>70000||
 !Number.isSafeInteger(targetFreshInputTokens)||targetFreshInputTokens<1||targetFreshInputTokens>maxFreshInputTokens||
 policy.cacheEvidenceMaxAgeMs!==3600000)throw Error('INVALID_OWNER_FRESH_CACHE_INPUT_BUDGET');
 return{maxInputTokens,maxSerializedTextBytes,maxFreshInputTokens,maxCachedInputTokens,targetFreshInputTokens,
 cacheEvidenceMaxAgeMs:policy.cacheEvidenceMaxAgeMs,cacheHitGuarantee:false,outputBudgetUnchanged:true};
}
export async function loadClientRequestBudget(file){
 if(typeof file!=='string'||!file.trim())throw Error('EXPLICIT_POLICY_FILE_REQUIRED');
 return validateRequestBudget(JSON.parse(await readFile(file,'utf8')));
}
