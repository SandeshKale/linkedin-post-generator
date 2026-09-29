Slide 1 (hook):
Dark slide with a magnifying-glass search icon badge and eyebrow label 'RAG Architecture'. Large headline: Your RAG pipeline doesn't have a model problem. Subheading: It has a retrieval problem — hybrid search + reranking took answer accuracy 2.3x higher, same LLM, same index.

Slide 2 (diagram):
Hand-sketched D2 flowchart, top to bottom: Query, arrow labeled 'BM25 + embeddings' down into Hybrid Search, arrow labeled 'cross-encoder' down into Rerank, arrow labeled 'top ~8 chunks' down into Context Assembly, then down into LLM Answer. Five boxes in one vertical chain, three labeled arrows.

Slide 3 (list):
List slide, heading 'Why Naive Top-K Retrieval Breaks First', four numbered rows each with a small icon badge: a search icon, a layered-squares icon, a balance-scale icon, and a speedometer icon, each beside 1-2 lines of body text describing a specific retrieval failure mode.

Slide 4 (stat):
Stat slide with a target icon badge and a large gradient '2.3x' figure, label 'Higher answer accuracy', a supporting sentence about hybrid search plus reranking, and a two-row horizontal bar chart underneath: a short bar for 'Vector-only top-k' and a much longer, highlighted bar for 'Hybrid + rerank'.

Slide 5 (list):
List slide, heading 'Fix It In This Order', four auto-numbered rows (badges 1 through 4) each with 1-2 lines of body text: add hybrid search, rerank with a cross-encoder, chunk semantically, then and only then widen the context window.

Slide 6 (cta):
Closing slide with a rocket icon badge, headline 'Fix retrieval before you touch the model.', and subheading 'Hybrid search, rerank, semantic chunking, then widen the context window. Follow for the next breakdown in this series.'
