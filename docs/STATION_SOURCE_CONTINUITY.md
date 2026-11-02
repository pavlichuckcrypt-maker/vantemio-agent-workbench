# Station Source continuity

A completed authenticated Station read may have a code-owned coverage footer after its transport receipt. `stationReadEnvelope` recognizes that representation only when the requested path, original call/request IDs, snapshot and receipt digests, contiguous returned rows, and coverage envelope agree. It rejects unknown trailing text and foreign/mismatched coverage. It is a presentation parser; the host must still authenticate the original receipt and enforce task/Goal, Source freshness, Stop and CAS.

The OpenCode working-view and local Source-index consumers must use the same envelope contract. Rejecting all post-receipt text silently dropped valid Source after its latest tool turn, causing repeated reads of unchanged complementary ranges.

`summarizeSourceRanges` merges cached ranges by exact normalized file and observed Source SHA. It records which originals supply those ranges. Fetching the whole file does not establish that all pages were displayed, reviewed, tested or accepted. Unknown or inconsistent file size stays unknown; different Source hashes stay separate. No provider cache hit is inferred, no context ceiling changes, and no original tool or native history is replayed or rewritten.

This helper is available in the shared library source. Adopting it into OpenCode does not update the independent Harness Chief backend or its release package.
