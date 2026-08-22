# BurnGuard inline design vibe research ledger

Research date: 2026-08-22. Repository observations use the pinned GitHub
commit shown in each source URL. Prices are public US monthly references where
the official page exposed them; dynamic pricing pages are marked for
re-checking before any commercial claim.

## Reference repositories

| Source | Observed pattern | BurnGuard transfer | Do not copy |
| --- | --- | --- | --- |
| [typst/typst @ 35417aa](https://github.com/typst/typst/tree/35417aa769ab9d699a60384f91082b09bc6ba421) | Structured source is transformed into deterministic rendered output; architecture and usage docs make the source/output relationship explicit. | Keep generated HTML and source files on disk, show the selected file and reversible patch rather than hiding mutation behind chat. | A new document language or compiler; BurnGuard should preserve HTML/CSS. |
| [changeroa/visual-learning @ 3c71a89](https://github.com/changeroa/visual-learning/tree/3c71a8923e48b425cae82dbdb5180dd5600221dc) | Skill-driven visual learning flow keeps visual decisions explicit and inspectable. | Treat a visual change as a named intent plus an observable canvas result, not an opaque prompt transcript. | A separate learning product or long-running curriculum. |
| [cathrynlavery/diagram-design @ 648c2a5](https://github.com/cathrynlavery/diagram-design/tree/648c2a597839301e06df1e7434a08bde9f42eed3) | Semantic patterns and optional motion are documented independently of the final rendered diagram. | Keep selection metadata and reduced-motion behavior separate from the preview renderer. | Diagram-specific semantics and animation defaults. |
| [changeroa/StyleGallery @ 9049f13](https://github.com/changeroa/StyleGallery/tree/9049f132426006661ac44aea4714d07426c432e5) | Agent-native style references turn visual direction into reusable, inspectable inputs. | Keep a small design-system token/context summary beside the selected node and show the user what context will be patched. | A gallery marketplace or unbounded style catalog. |
| [img2threejs/img2threejs @ d667338](https://github.com/img2threejs/img2threejs/tree/d6673386f89673a58736f8d398dd16ece67874f5) | Input, transformation, and preview are staged so a user can see the artifact before committing to output. | Preserve a stable preview during patching and expose retry/recovery when a render is interrupted. | Image-to-3D generation or a new asset pipeline. |
| [gongnyang/gongnyang-prompt-kit @ fb5f75f](https://github.com/gongnyang/gongnyang-prompt-kit/tree/fb5f75f2f6dbaaa649464dc089f573bea4a9ebf1) | Prompt routing and a checker script make input quality and intent selection explicit. | Add bounded context and clear selection intent to inline edits; validate the patch boundary before writing. | Its prompt taxonomy or Korean copy outside existing product surfaces. |
| [NomaDamas/slides-grab @ 7516219](https://github.com/NomaDamas/slides-grab/tree/751621912d82896d08c2568e70964d42b5ed23bf) | Screenshot-to-editor workflow connects visual capture with an editable artifact surface. | Keep screenshot evidence paired with the underlying file/diff so visual QA is not detached from ownership. | Slide-specific layout assumptions. |
| [NomaDamas/bananatape @ a6e52b9](https://github.com/NomaDamas/bananatape/tree/a6e52b95a01963e5b1b4e9f172cf12dde43e2062) | Local-first project model and editor surface keep work available on disk and make the project boundary clear. | Preserve local files, explicit project paths, and reversible checkpoints as the product's trust advantage. | Its editor schema and project-specific workflow. |

### Synthesis

The common useful pattern is a visible chain of intent -> bounded transform ->
stable preview -> inspectable source -> reversible output. BurnGuard already has
the file patch, iframe bridge, event stream, and undo primitives; the missing
product affordance was carrying the selected authored node into Tweaks without
making the user hit-test it again. The vertical slice implements that bridge,
while the temp-file watcher fix protects the stable preview promised by the
chain.

## Paid personal-product comparison

| Product | Public reference price | What it activates | BurnGuard opportunity / gap | Primary source |
| --- | --- | --- | --- | --- |
| Bolt.new | Pro $25/month, monthly | Prompt-to-app/site, hosted preview and deployment. | BurnGuard can win on local files, inspectable DOM/CSS context, deterministic undo, and no forced hosted artifact; it still lacks Bolt's hosted deployment convenience. | [bolt.new/pricing](https://bolt.new/pricing), retrieved 2026-08-22 |
| v0 by Vercel | Premium $20/month | Design, iterate, and scale full-stack web apps with credit-backed generations. | BurnGuard can charge for local-first ownership, canvas selection, bounded context, and file-level reversibility; it needs a stronger code/diff review surface to match v0's iteration polish. | [v0 pricing docs](https://v0.app/docs/pricing), retrieved 2026-08-22 |
| Claude Pro | $20/month US monthly | General Claude access and extended usage for recurring creative/development work. | BurnGuard is not another chat subscription: its paid value must be the artifact workflow, local privacy, visible visual context, and undo. | [Anthropic pricing](https://claude.com/pricing) and [Pro help](https://support.claude.com/en/articles/8325606-what-is-the-pro-plan), retrieved 2026-08-22 |
| Figma Professional | $16/editor/month annual reference | Collaborative interface design, component/system context, and developer handoff. | BurnGuard can complement or replace parts of handoff by keeping source and rendered result together; it still lacks Figma's collaboration depth and mature component graph. | [Figma Professional](https://www.figma.com/professional/) and [pricing](https://www.figma.com/pricing/), retrieved 2026-08-22; verify billing selector |
| Webflow Basic | $18/month monthly reference | Hosted visual website building, custom domain, and publishing. | BurnGuard can differentiate with local-first source ownership and reversible code changes; it still lacks Webflow's hosted publishing ecosystem. | [Webflow pricing](https://webflow.com/pricing), retrieved 2026-08-22; verify current billing selector |
| Framer Basic | $15/month annual reference | Visual website editing, publishing, and responsive layout workflow. | BurnGuard can own the inspectable code path and local artifacts; it still needs a stronger first-run editor and publishing story. | [Framer pricing](https://www.framer.com/pricing), retrieved 2026-08-22; verify current billing selector |

### Pay-worthy thesis

A defensible $9+/month BurnGuard plan is a local-first visual change loop for
people who repeatedly move between a browser preview and source code: select
what is wrong, see the exact computed/token context, apply one bounded change,
review the file diff, and undo without losing the project. The recurring value
is not raw model access; it is reducing the high-cost handoff between visual
intent and owned source while preserving privacy and recovery. The current
gaps before charging are a first-class code/diff review surface, stronger
multi-user collaboration, and a clear publish/export story.
