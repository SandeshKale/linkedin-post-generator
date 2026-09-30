# Caption — "You're Paying Full Price For The Same Prompt Prefix, Every Call"

You're not overpaying for LLM calls because the model is expensive. You're overpaying because the same 4,000-token system prompt gets recomputed from scratch on every single request.

Prompt caching lets a model reuse a previously-processed prefix instead of recomputing it — up to 90% cheaper on the cached portion, up to 85% faster. Most teams turn it on, watch the bill barely move, and conclude it "doesn't really help." It's not that caching doesn't work. It's that they never actually get a hit.

💾 Save this if you're running any prompt over a few hundred tokens in production.

🔑 The mechanism
A cache hit requires the prefix to be byte-identical to something already cached, within the TTL window (5 minutes by default). Match, and you pay ~10% of normal input cost for that portion with dramatically lower latency. Miss, and you pay full price plus a ~25% premium to write the new cache entry.

📊 The number
Same model, same prompt, same output — the only variable was cache hit vs miss. Latency dropped 85% on the hit. The cost curve moves even harder: a cache hit is roughly a 90% discount on the cached input tokens.

⚠️ Why teams miss it anyway
→ A timestamp or request ID gets interpolated into the system prompt — the prefix is different every call, guaranteed miss.
→ The dynamic user question sits BEFORE the static content instead of after it — nothing past the first byte difference can cache.
→ Nobody's actually checking cache_read vs cache_creation tokens, so a 0%-hit-rate cache looks identical to a working one on the invoice.

✅ Fix it: static content first (system prompt, tool defs, docs), dynamic content last, byte-identical prefix every call, and actually log your hit rate instead of assuming it's working.

🌍 Is your production system actually hitting cache, or have you just assumed it is? Genuinely curious how many people have checked the real numbers.
