# Caption — "RAG Isn't Dead. Your Retrieval Layer Is."

Your RAG pipeline isn't broken because the model is dumb. It's broken because your retrieval layer never learned to read.

Most "RAG doesn't work" complaints trace back to the exact same bug: a pure vector-similarity search over fixed-size chunks, with no reranking step and no keyword fallback. The LLM gets blamed for a wrong answer it never had a fair chance at — the right chunk simply wasn't in its top-k.

💾 Save this if you're running anything retrieval-augmented in production.

🔍 The mechanism
Hybrid search (BM25 + embeddings) catches what pure vector search misses — exact IDs, error codes, SKUs, anything embedding similarity alone won't reliably surface. A cross-encoder reranker then re-scores the hybrid candidates against the query's actual intent before any of it reaches the LLM.

📊 The number
Same base vector index, same LLM, same chunk size — only the retrieval layer changed. Adding hybrid search plus a rerank stage on top of the same naive pipeline took answer accuracy 2.3x higher in a direct head-to-head test.

⚠️ Where teams get stuck
→ They raise k instead of raising precision — more noisy chunks, not better ones.
→ Fixed-size chunking slices right through the sentence that actually answers the question.
→ No reranking step means the LLM sees results ranked by embedding similarity alone, never by real relevance.

✅ Fix it in this order: hybrid search → rerank → semantic chunking → only then widen the context window. Widening the window before fixing retrieval just gives the wrong chunks more room to sit in.

🌍 What's the retrieval bug you've hit most in production — missing keyword matches, bad chunking, or no reranker at all? Curious what's actually breaking other people's RAG stacks.
