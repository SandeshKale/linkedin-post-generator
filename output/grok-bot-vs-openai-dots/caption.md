# Caption — "Two AI Labs Shipped The Same Idea, Seven Weeks Apart"

Two AI labs just shipped the same core bet, seven weeks apart — and almost nobody's talking about the architecture, just the hype.

August 11: xAI ships Grok Bot — AI teammates that get their own cloud computer, work inside your existing tools, and keep going while you're offline. September 29, at OpenAI's DevDay: Dots — an always-on agent that also gets its own cloud computer and browser, running on GPT-6 Astra.

Same core idea. Different bets underneath.

💾 Save this if you're evaluating either product, or architecting your own agent system.

🤖 The convergence
Both labs independently landed on the same primitive: an agent needs a persistent, isolated compute environment — not just stateless API calls — to actually finish real work unsupervised. That's not a coincidence. If you're building agents yourself, this is the part worth copying first.

🔀 Where they diverge
Grok Bot treats multi-agent coordination as core: bots message each other directly, pass work, and assign ownership inside shared group chats, and they're built to operate tools with no clean API or MCP support at all. Dots leans the other way — 4,000+ pre-built app connectors through OpenAI's existing plugin ecosystem, reachable from ChatGPT, Slack, and Microsoft Teams at launch. Tighter integrations vs. broader raw access — a real architecture tradeoff, not a marketing one.

⚠️ What's still unverified
Neither company has published hard reliability numbers, task-completion rates, or full pricing yet. Every claim in this post is sourced from each company's own launch material — not independent benchmarks. Treat both as directional until real usage data exists.

🌍 If you've gotten access to either one — what's actually held up under real use, and what hasn't? Genuinely curious what the early builders are seeing.
