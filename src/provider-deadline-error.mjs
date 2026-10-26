// Exact native model error only. A bare tool timeout or owner abort is not a retry grant.
export function nativeProviderDeadline(error) {
  let value=error;
  if (typeof value === 'string') {
    try {value=JSON.parse(value);} catch {return false;}
  }
  return value?.name === 'UnknownError' && value.data?.message === 'The operation timed out.';
}
