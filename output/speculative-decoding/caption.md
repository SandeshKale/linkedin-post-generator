# Caption — "Speculative Decoding: The Math That Makes LLM Inference Faster For Free"

Your LLM isn't slow because it's short on compute. It's slow because generating one token at a time forces the GPU to reload every weight from memory on every single step — and that memory transfer, not the matmul, is what you're actually waiting on.

Speculative decoding fixes this. Save this if you ship anything on top of an LLM API or your own inference stack.

⚡ The Mechanism
A small draft model guesses the next several tokens on its own. The large target model scores all of them in ONE forward pass instead of one slow, memory-bound pass per token.

🎲 Why Quality Never Drops
Draft tokens aren't kept because they "look right." Each one is accepted with probability min(1, p_target / p_draft). A rejection resamples from the exact residual distribution needed to correct the draft's bias — so the output is mathematically guaranteed to match what the target model alone would have produced. Same quality, fewer expensive passes.

📊 The Number
Google Research's original result: a 60M-parameter draft model verified against an 11B-parameter target hit ~3x faster inference — zero quality loss.

⚠️ Where It Breaks
→ Draft and target need matching tokenizers — no fallback for mismatched vocabularies.
→ A weak draft model tanks the acceptance rate: you pay for two forward passes and gain nothing.
→ A separate draft model means a second KV cache. EAGLE-style self-drafting reuses the target model's own hidden states instead of running an independent model.

Full breakdown — the algorithm, the rejection-sampling math, and the diagram — in the carousel below.
