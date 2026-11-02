# Felix AI
Static ChatGPT-style chat app. AI backend: Groq (openai/gpt-oss-120b, streaming) with automatic fallback to Pollinations (https://text.pollinations.ai/openai, free, no key) if Groq errors or rate-limits. Images: Pollinations. To switch providers, edit config.js.
Live: https://grass-art-wstl4.ship.place/ (ship.page free, anonymous; goes offline 2026-12-02 21:31 UTC unless claimed; claim info is in .deploy-shippage.json)
Local: cd /workspace/felix-ai && python3 -m http.server 8787

## Groq proxy (Cloudflare Worker)
`proxy/worker.js` is deployed as `felix-ai-proxy` (https://felix-ai-proxy.swnnvpfb8n.workers.dev/v1/chat/completions). The Groq key lives only in the Worker secret `GROQ_API_KEY`. The Worker allows only the GitHub Pages origin + localhost, whitelists models (gpt-oss-120b/20b, qwen3.8-27b) and caps max tokens at 2048.
