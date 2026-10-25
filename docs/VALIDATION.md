# Validation and limitations

Verification date: 2026-10-25.

## Private deployment evidence (summarized, no private artifacts published)

- 47 Node test cases passed across14 isolated test files;0 failures/skips.
- 171 backend JavaScript modules passed syntax checks.
- Six existing native chats each completed a new assistant response and tool after one guarded module load.
- Exact Goal-bound local Source was observed in the auditor's outgoing context.
- Original Cloudflare validator suites:65 passed on POSIX; native Windows had seven CLI compatibility failures (not ignored or relabelled).
- Playwright0.1.22 passed an isolated Chrome fixture; this was not a website security audit.

These checks do not cover every possible failure. One historical projection script requires a private captured request and was excluded from the isolated regression suite. Remote provider reliability, private transport behavior, production release, hostile public load and model identity are not certified by these tests.

## Public package

Run `npm test` and `npm run check:release`. Public adaptations remove machine defaults and provider-specific identity and add standalone stop/unknown guards and source-conflict rejection. The release scanner checks the allowlisted source tree for common secrets and deployment identifiers; manual review is still required. No public compatibility claim is made for the full private Studio runtime.

## Model quality

A requested/reported model name and reasoning setting do not attest the underlying model behind a proxy. Judge quality by correct implemented changes, independent tests, adherence to scope and actual consumer behavior. Private reasoning transcripts, internal paths, chat history and model credentials are not published here.
