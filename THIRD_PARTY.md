# Third-party components

This repository does not redistribute upstream skill contents or third-party npm packages. Exact public sources and commits are in `config/skills.lock.json`:

- https://github.com/cloudflare/security-audit-skill
- https://github.com/cloudflare/skills
- https://github.com/trailofbits/skills
- https://github.com/anthropics/skills
- https://github.com/microsoft/playwright-cli
- https://github.com/obra/superpowers

Read each upstream repository's license at the pinned commit before installing or redistributing it. Their licenses are not replaced by this project's MIT license. Playwright CLI, OpenCode, tokenizers and context-pruning plugins are not bundled. Existing deployment uses its own pinned integration versions; consumers must test their own native host compatibility.
