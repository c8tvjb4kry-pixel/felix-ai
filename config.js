/* ===== KONFIGURASI FELIX AI =====
 * Ganti bagian ini untuk memakai penyedia AI lain (OpenAI, Groq, OpenRouter, dll).
 * Semua endpoint harus kompatibel dengan format OpenAI /chat/completions.
 *
 * Contoh OpenAI:
 *   API_URL: "https://api.openai.com/v1/chat/completions", API_KEY: "sk-...", MODEL: "gpt-4o-mini"
 * Contoh Groq:
 *   API_URL: "https://api.groq.com/openai/v1/chat/completions", API_KEY: "gsk_...", MODEL: "llama-3.3-70b-versatile"
 * PERINGATAN: API key di file ini akan terlihat publik jika situs dipublikasikan.
 */
window.FELIX_CONFIG = {
  API_URL: "https://text.pollinations.ai/openai",   // gratis, tanpa daftar, tanpa key
  API_KEY: "",                                        // kosongkan untuk Pollinations
  MODEL: "openai",
  STREAM: true,
  TEMPERATURE: 0.7,
  MAX_HISTORY: 20,   // jumlah pesan terakhir yang dikirim sebagai konteks
  SYSTEM_PROMPT:
    "Kamu adalah Felix AI, asisten AI yang ramah, cerdas, dan membantu. " +
    "Nama kamu Felix AI (jangan menyebut dirimu ChatGPT atau model lain). " +
    "Selalu jawab dalam bahasa yang digunakan pengguna (default: Bahasa Indonesia). " +
    "Gunakan format Markdown bila membantu (daftar, tabel, blok kode dengan nama bahasa)."
};
