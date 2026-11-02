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
  FREE_COOLDOWN_MS: 45000, // batas gratis Pollinations: 1 balasan / 45 dtk per IP. Set 0 jika memakai API key.
  SYSTEM_PROMPT:
    "Kamu adalah Felix AI, asisten AI yang ramah, cerdas, dan membantu. " +
    "Nama kamu Felix AI (jangan menyebut dirimu ChatGPT atau model lain). " +
    "Selalu jawab dalam bahasa yang digunakan pengguna (default: Bahasa Indonesia). " +
    "Gunakan format Markdown bila membantu (daftar, tabel, blok kode dengan nama bahasa). " +
    "Kamu juga bisa membuat gambar: jika pengguna ingin gambar, sarankan memakai tombol 'Buat gambar' atau perintah /gambar.",

  /* ===== GENERATOR GAMBAR =====
   * URL template; {prompt} {width} {height} {seed} {model} akan diganti otomatis.
   * Default: Pollinations (gratis, tanpa key). Ganti di sini untuk penyedia lain berbasis URL GET.
   */
  IMAGE_URL_TEMPLATE: "https://image.pollinations.ai/prompt/{prompt}?width={width}&height={height}&seed={seed}&nologo=true&model={model}",
  IMAGE_MODEL: "",                 // kosong = model default penyedia
  IMAGE_ENHANCE_PROMPT: true,      // terjemahkan & perkaya prompt ke bahasa Inggris memakai model chat
  IMAGE_ENHANCE_TIMEOUT_MS: 15000,
  IMAGE_SIZES: {
    persegi: { label: "Persegi 1:1", width: 1024, height: 1024 },
    potret:  { label: "Potret 3:4", width: 768,  height: 1024 },
    lanskap: { label: "Lanskap 16:9", width: 1280, height: 720 }
  }
};
