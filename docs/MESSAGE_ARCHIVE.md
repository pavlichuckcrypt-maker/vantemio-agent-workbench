# Verified local message archive

`createVerifiedMessageArchive` preserves the existing content-addressed message files and JSONL history index. It hashes the actual supplied message, verifies a newly created or previously unqualified archive body, and stores only a bounded filesystem proof. Warm reuse requires an unchanged regular-file identity, size and nanosecond modification/change stamps. A changed, missing, replaced or evicted file takes the local verification path again. Without precise timestamps the fast path is disabled. A conflicting supplied native session is rejected.

The proof cache contains no historical message bodies. Its capacity is a cache limit, not a RAM reservation, chat limit or action limit. Concurrent identical local archives share one write and verification; the index preserves the original message and session IDs. Cache deletion can restore bytes from the same supplied original; corruption remains explicit and is not silently overwritten.

This removes repeated historical-body reads during context preparation. It does not claim a provider prompt-cache hit, change model/provider selection or context ceilings, replay tools, or mutate native chat history. Hosts still enforce current task/Goal, Source freshness, Stop and effect ledgers. Retained references remain hash-bound; archive reuse alone cannot complete an audit or accept production work.
