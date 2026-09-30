Slide 1 (hook):
Dark slide with a coin icon badge and eyebrow label 'LLM Cost Engineering'. Large headline: You're paying full price for the same prompt, every single call. Subheading: Prompt caching cuts input cost up to 90% and latency up to 85% — most teams never actually get a hit.

Slide 2 (diagram):
Mermaid flowchart, top to bottom: Request arrives, into a decision diamond 'Prefix byte-identical to a cached one?'. The Yes-within-TTL branch goes to 'Cache hit: serve prefix from cache' then down to '~10% of input cost, up to 85% less latency'. The No-or-expired branch goes to 'Cache miss: full prefill computed' then down to 'Full input cost + 25% to write new cache'. One decision point, two outcome chains.

Slide 3 (list):
List slide, heading 'Why Teams Never Actually Get A Hit', four rows each with a small icon badge (refresh arrows, a balance scale, a clock, a warning triangle) beside 1-2 lines of body text describing a specific reason prompt caching silently fails to trigger.

Slide 4 (stat):
Stat slide with a lightning-bolt icon badge and a large gradient '85%' figure, label 'Lower latency on a cache hit', a supporting sentence about the prefix being served from cache versus recomputed, and a two-row horizontal bar chart: a long bar for 'Cache miss' and a short, highlighted bar for 'Cache hit'.

Slide 5 (list):
List slide, heading 'How To Actually Get The Hit', four auto-numbered rows (badges 1 through 4) each with 1-2 lines of body text: order static content first, keep the prefix byte-identical, batch inside the TTL window, and actually log cache read vs creation tokens.

Slide 6 (cta):
Closing slide with a rocket icon badge, headline 'Reorder your prompt before you reach for a smaller model.', and subheading 'A cache hit is a bigger lever than most model-downsizing decisions. Follow for the next cost-engineering breakdown.'
