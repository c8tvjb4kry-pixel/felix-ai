(function () {
  "use strict";
  var CFG = window.FELIX_CONFIG;
  var STORE = "felix-chats-v1";
  var $ = function (id) { return document.getElementById(id); };
  var els = {
    sidebar: $("sidebar"), overlay: $("overlay"), history: $("history"), messages: $("messages"),
    welcome: $("welcome"), input: $("input"), form: $("composer"), send: $("sendBtn"), title: $("chatTitle")
  };
  var chats = load();
  var currentId = null;
  var controller = null;

  // ---------- Storage ----------
  function load() { try { return JSON.parse(localStorage.getItem(STORE)) || []; } catch (e) { return []; } }
  var fullImages = new WeakMap(); // foto ukuran penuh hanya di memori (riwayat menyimpan thumbnail kecil)
  function save() {
    for (var tries = 0; tries < 60; tries++) {
      try { localStorage.setItem(STORE, JSON.stringify(chats)); return true; }
      catch (e) { if (!dropOldestThumbs()) break; }
    }
    toast("⚠️ Penyimpanan browser penuh — sebagian riwayat mungkin tidak tersimpan. Hapus beberapa chat lama.");
    return false;
  }
  // Saat kuota localStorage penuh: hapus thumbnail foto dari chat paling lama dulu.
  function dropOldestThumbs() {
    var sorted = chats.slice().sort(function (a, b) { return a.updated - b.updated; });
    for (var i = 0; i < sorted.length; i++) {
      var ms = sorted[i].messages;
      for (var j = 0; j < ms.length; j++) {
        if (ms[j].thumbs && ms[j].thumbs.length) { ms[j].photoCount = ms[j].thumbs.length; delete ms[j].thumbs; return true; }
      }
    }
    return false;
  }
  var toastTimer = null;
  function toast(msg) {
    var t = $("toast"); if (!t) return;
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove("show"); }, 3600);
  }
  function getChat(id) { return chats.find(function (c) { return c.id === id; }); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  // ---------- Markdown ----------
  function esc(s) { return s.replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  if (window.marked) {
    var renderer = new marked.Renderer();
    renderer.code = function (code, lang) {
      if (typeof code === "object" && code) { lang = code.lang; code = code.text; }
      lang = (lang || "").split(/\s/)[0];
      var html;
      try {
        html = window.hljs ? (lang && hljs.getLanguage(lang) ? hljs.highlight(code, { language: lang }).value : hljs.highlightAuto(code).value) : esc(code);
      } catch (e) { html = esc(code); }
      return '<div class="codeblock"><div class="codehead"><span>' + esc(lang || "kode") +
        '</span><button class="copy-btn" data-copy>📋 Salin kode</button></div><pre><code class="hljs">' + html + "</code></pre></div>";
    };
    marked.setOptions({ renderer: renderer, gfm: true, breaks: true });
  }
  function md(text) {
    if (!window.marked) return "<p>" + esc(text).replace(/\n/g, "<br>") + "</p>";
    var html = marked.parse(text);
    return window.DOMPurify ? DOMPurify.sanitize(html, { ADD_ATTR: ["data-copy"] }) : html;
  }

  // ---------- Rendering ----------
  function renderHistory() {
    els.history.innerHTML = "";
    if (!chats.length) { els.history.innerHTML = '<div class="empty-hist">Belum ada percakapan</div>'; return; }
    chats.slice().sort(function (a, b) { return b.updated - a.updated; }).forEach(function (c) {
      var d = document.createElement("div");
      d.className = "hist-item" + (c.id === currentId ? " active" : "");
      d.innerHTML = '<span class="t"></span><button class="del" title="Hapus chat">🗑</button>';
      d.querySelector(".t").textContent = c.title || "Chat baru";
      d.onclick = function () { openChat(c.id); closeSidebar(); };
      d.querySelector(".del").onclick = function (e) {
        e.stopPropagation();
        if (!confirm("Hapus chat ini?")) return;
        chats = chats.filter(function (x) { return x.id !== c.id; });
        save();
        if (currentId === c.id) newChat(); else renderHistory();
      };
      els.history.appendChild(d);
    });
  }

  function addMsgEl(role, content, m) {
    els.welcome.style.display = "none";
    var wrap = document.createElement("div");
    wrap.className = "msg " + (role === "user" ? "user" : "bot");
    if (role === "user") {
      wrap.innerHTML = '<div class="bubble"></div>';
      var ub = wrap.querySelector(".bubble"), pics = (m && m.thumbs) || [];
      if (pics.length) {
        var g = document.createElement("div"); g.className = "u-photos n" + Math.min(pics.length, 4);
        pics.forEach(function (src, i) {
          var im = document.createElement("img"); im.src = src; im.alt = "Foto " + (i + 1); im.title = "Lihat ukuran penuh";
          im.onclick = function () { openLightbox((fullImages.get(m) || [])[i] || src); };
          g.appendChild(im);
        });
        ub.appendChild(g); wrap.classList.add("has-photos");
      } else if (m && m.photoCount) {
        var n = document.createElement("div"); n.className = "u-photo-gone"; n.textContent = "📷 " + m.photoCount + " foto (tidak tersimpan karena memori penuh)"; ub.appendChild(n);
      }
      if (content) { var tx = document.createElement("div"); tx.className = "u-text"; tx.textContent = content; ub.appendChild(tx); }
    } else {
      wrap.innerHTML = '<img class="avatar" src="icons/icon.svg" alt="Felix"><div style="flex:1;min-width:0"><div class="bubble"></div><div class="msg-actions"></div></div>';
      setBot(wrap, content);
    }
    els.messages.appendChild(wrap);
    scrollDown();
    return wrap;
  }
  function setBot(wrap, content, streaming) {
    var b = wrap.querySelector(".bubble");
    b.innerHTML = md(content);
    b.classList.toggle("cursor", !!streaming);
    var acts = wrap.querySelector(".msg-actions");
    if (!streaming && content) {
      acts.innerHTML = '<button data-act="copy">📋 Salin</button>';
      acts.querySelector('[data-act="copy"]').onclick = function () { copy(content, this, "📋 Salin"); };
    } else acts.innerHTML = "";
  }
  function scrollDown(force) {
    var m = els.messages;
    if (force || m.scrollHeight - m.scrollTop - m.clientHeight < 200) m.scrollTop = m.scrollHeight;
  }
  function copy(text, btn, label) {
    var done = function () { btn.textContent = "✅ Tersalin"; setTimeout(function () { btn.textContent = label; }, 1500); };
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, done);
    else { var t = document.createElement("textarea"); t.value = text; document.body.appendChild(t); t.select(); document.execCommand("copy"); t.remove(); done(); }
  }
  els.messages.addEventListener("click", function (e) {
    var b = e.target.closest("[data-copy]");
    if (b) copy(b.closest(".codeblock").querySelector("code").innerText, b, "📋 Salin kode");
  });

  function clearMessages() { Array.prototype.slice.call(els.messages.querySelectorAll(".msg")).forEach(function (n) { n.remove(); }); }
  function openChat(id) {
    if (controller) controller.abort();
    var c = getChat(id); if (!c) return newChat();
    currentId = id; clearMessages();
    els.messages.classList.add("no-anim");
    setTimeout(function () { els.messages.classList.remove("no-anim"); }, 50);
    els.welcome.style.display = c.messages.length ? "none" : "";
    c.messages.forEach(function (m) {
      if (m.type === "image") renderImage(addMsgEl("assistant", ""), m);
      else addMsgEl(m.role, m.content, m);
    });
    els.title.textContent = c.title || "Felix AI";
    renderHistory(); scrollDown(true);
  }
  function newChat() {
    if (controller) controller.abort();
    currentId = null; clearMessages(); els.welcome.style.display = "";
    els.title.textContent = "Felix AI"; renderHistory(); closeSidebar(); typeGreeting(); els.input.focus();
  }

  // ---------- AI call ----------
  // Penyedia utama (config) + cadangan otomatis (CFG.FALLBACK) bila utama gagal / kena limit.
  function providers(vision) {
    if (vision && CFG.VISION && CFG.VISION.MODEL) // foto hanya bisa dibaca model vision Groq (cadangan Pollinations gratis tidak mendukung gambar)
      return [{ name: "vision", url: CFG.API_URL, key: CFG.API_KEY, model: CFG.VISION.MODEL, extra: CFG.VISION.EXTRA_BODY || {}, cooldown: 0, wait: true }];
    var list = [{ name: "utama", url: CFG.API_URL, key: CFG.API_KEY, model: CFG.MODEL, extra: CFG.EXTRA_BODY || {}, cooldown: CFG.FREE_COOLDOWN_MS || 0, wait: false }];
    var f = CFG.FALLBACK;
    if (f && f.API_URL) list.push({ name: "cadangan", url: f.API_URL, key: f.API_KEY, model: f.MODEL, extra: f.EXTRA_BODY || {}, cooldown: f.FREE_COOLDOWN_MS || 0, wait: true });
    else list[0].wait = true;
    return list;
  }
  var lastTextAt = {};
  function sleep(ms, signal) {
    return new Promise(function (resolve, reject) {
      var t = setTimeout(resolve, ms);
      if (signal) signal.addEventListener("abort", function () { clearTimeout(t); var e = new Error("aborted"); e.name = "AbortError"; reject(e); });
    });
  }
  // Batas gratis (mis. Pollinations: 1 balasan / 45 dtk per IP) -> tunggu otomatis lalu coba lagi.
  function retryAfterSec(res, text) {
    var h = parseInt(res.headers.get("retry-after"), 10); if (h > 0) return h;
    var m = /retry after\s*(\d+(?:\.\d+)?)\s*s/i.exec(text || ""); if (m) return Math.ceil(parseFloat(m[1]));
    m = /try again in\s*(?:(\d+)m)?\s*(\d+(?:\.\d+)?)\s*s/i.exec(text || ""); return m ? Math.ceil((parseInt(m[1] || "0", 10) * 60) + parseFloat(m[2])) : 0;
  }
  async function requestProvider(p, messages, stream, temperature, signal, onWait) {
    var headers = { "Content-Type": "application/json" };
    if (p.key) headers["Authorization"] = "Bearer " + p.key;
    var body = Object.assign({ model: p.model, stream: !!stream, temperature: temperature, seed: Math.floor(Math.random() * 1e9), messages: messages }, p.extra);
    var res, tries = 0;
    while (true) {
      res = await fetch(p.url, { method: "POST", headers: headers, body: JSON.stringify(body), signal: signal });
      lastTextAt[p.name] = Date.now();
      if (p.wait && (res.status === 402 || res.status === 429) && tries < 3) {
        var txt0 = ""; try { txt0 = await res.text(); } catch (e) {}
        if (res.status === 402 && !/limit/i.test(txt0)) throw new Error("HTTP 402: " + txt0.slice(0, 200));
        var wait = Math.min(Math.max(retryAfterSec(res, txt0), 3), 90) + 1; tries++;
        for (var sec = wait; sec > 0; sec--) { if (onWait) onWait(sec); await sleep(1000, signal); }
        continue;
      }
      if (p.wait && res.status >= 500 && tries < 3) { tries++; await sleep(2500 * tries, signal); continue; }
      break;
    }
    if (!res.ok) { var t = ""; try { t = await res.text(); } catch (e) {} throw new Error("HTTP " + res.status + (t ? ": " + t.slice(0, 200) : "")); }
    return res;
  }
  async function readReply(res, onDelta, signal) {
    var ctype = res.headers.get("content-type") || "";
    if (!res.body || ctype.indexOf("event-stream") < 0) {
      var j = await res.json();
      var txt = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || "";
      if (onDelta) await typeOut(txt, onDelta, signal);
      return txt;
    }
    var reader = res.body.getReader(), dec = new TextDecoder(), buf = "", full = "";
    while (true) {
      var r = await reader.read(); if (r.done) break;
      buf += dec.decode(r.value, { stream: true });
      var lines = buf.split("\n"); buf = lines.pop();
      for (var i = 0; i < lines.length; i++) {
        var l = lines[i].trim();
        if (l.indexOf("data:") !== 0) continue;
        var data = l.slice(5).trim(); if (data === "[DONE]") continue;
        try {
          var d = JSON.parse(data), delta = d.choices && d.choices[0] && d.choices[0].delta;
          if (delta && typeof delta.content === "string" && delta.content) { full += delta.content; if (onDelta) onDelta(full); }
        } catch (e) {}
      }
    }
    return full;
  }
  async function callAI(history, onDelta, signal, onWait, onSwitch, vision) {
    var messages = [{ role: "system", content: CFG.SYSTEM_PROMPT }].concat(history.slice(-CFG.MAX_HISTORY));
    var list = providers(vision), lastErr;
    for (var i = 0; i < list.length; i++) {
      var got = false;
      try {
        if (i > 0 && onSwitch) onSwitch(list[i]);
        var res = await requestProvider(list[i], messages, CFG.STREAM, CFG.TEMPERATURE, signal, onWait);
        var reply = await readReply(res, function (t) { got = true; onDelta(t); }, signal);
        if (reply || i === list.length - 1) return reply;
        lastErr = new Error("Jawaban kosong");
      } catch (e) {
        if (e.name === "AbortError" || got) throw e;
        lastErr = e;
        if (window.console) console.warn("Felix AI: penyedia " + list[i].name + " gagal:", e.message);
      }
    }
    throw lastErr || new Error("Tidak ada penyedia AI");
  }
  async function typeOut(txt, onDelta, signal) { // efek mengetik jika respons non-streaming
    for (var i = 0; i <= txt.length; i += 4) { if (signal.aborted) return; onDelta(txt.slice(0, i)); await new Promise(function (r) { setTimeout(r, 8); }); }
    onDelta(txt);
  }

  // Susun pesan untuk API. Foto (bagian image_url) hanya disertakan untuk pesan terbaru, maksimal VISION.MAX_IN_CONTEXT.
  function buildApiMessages(c) {
    var V = CFG.VISION || {}, hist = c.messages.slice(-CFG.MAX_HISTORY), budget = V.MAX_IN_CONTEXT || 4;
    var ctxStart = hist.length - (V.CONTEXT_MESSAGES || 8), vision = false, out = new Array(hist.length);
    for (var i = hist.length - 1; i >= 0; i--) {
      var m = hist[i], text = m.content || "", srcs = fullImages.get(m) || m.thumbs || [], n = srcs.length || m.photoCount || 0;
      if (m.role === "user" && n) {
        var use = V.MODEL && i >= ctxStart ? srcs.slice(0, Math.max(budget, 0)) : [];
        if (use.length) {
          budget -= use.length; vision = true;
          var parts = [{ type: "text", text: (text || "Tolong jelaskan foto ini.") + (use.length < n ? "\n\n[" + (n - use.length) + " foto lain tidak disertakan]" : "") }];
          use.forEach(function (u) { parts.push({ type: "image_url", image_url: { url: u } }); });
          out[i] = { role: "user", content: parts }; continue;
        }
        text = (text || "Tolong jelaskan foto ini.") + "\n\n[Pengguna melampirkan " + n + " foto sebelumnya; foto itu tidak disertakan lagi]";
      }
      out[i] = { role: m.role, content: text };
    }
    return { messages: out, vision: vision };
  }

  async function send(text) {
    text = text.trim(); if (controller) return;
    if (pending.some(function (p) { return p.loading; })) { toast("⏳ Tunggu sebentar, foto sedang diproses…"); return; }
    var photos = pending.slice();
    if (!text && !photos.length) return;
    if (!photos.length) { // dengan foto: selalu dianalisis (tidak membuat gambar baru)
      var imgPrompt = detectImageRequest(text);
      if (imgPrompt === null && imageMode) imgPrompt = text;
      if (imgPrompt) return sendImage(text, imgPrompt);
    }
    var c = getChat(currentId);
    if (!c) {
      var tt = text || "📷 Foto";
      c = { id: uid(), title: (photos.length && text ? "📷 " : "") + tt.slice(0, 40) + (tt.length > 40 ? "…" : ""), messages: [], updated: Date.now() };
      chats.push(c); currentId = c.id; els.title.textContent = c.title;
    }
    var um = { role: "user", content: text };
    if (photos.length) { um.thumbs = photos.map(function (p) { return p.thumb; }); fullImages.set(um, photos.map(function (p) { return p.full; })); }
    c.messages.push(um); c.updated = Date.now(); save(); renderHistory();
    addMsgEl("user", text, um); scrollDown(true);
    els.input.value = ""; clearAttachments(); autosize();
    var built = buildApiMessages(c);

    var wrap = addMsgEl("assistant", "");
    wrap.querySelector(".bubble").innerHTML = '<div class="typing"><span></span><span></span><span></span></div>' + (built.vision ? '<span class="look-note">👀 Melihat foto…</span>' : "");
    wrap.classList.add("thinking");
    controller = new AbortController(); setBusy(true);
    var chatId = c.id, last = "", rafQueued = false, ended = false;
    try {
      var reply = await callAI(built.messages, function (partial) {
        last = partial;
        if (!rafQueued) { rafQueued = true; requestAnimationFrame(function () { rafQueued = false; if (ended) return; wrap.classList.remove("thinking"); setBot(wrap, last, true); scrollDown(); }); }
      }, controller.signal, function (sec) {
        if (!last) wrap.querySelector(".bubble").innerHTML = '<p class="muted-note">⏳ Batas gratis AI tercapai, mencoba lagi dalam ' + sec + " detik…</p>";
      }, function () {
        if (!last) wrap.querySelector(".bubble").innerHTML = '<p class="muted-note">🔁 Server utama sibuk, beralih ke server cadangan…</p>';
      }, built.vision);
      ended = true;
      if (!reply) reply = "_(Tidak ada jawaban. Silakan coba lagi.)_";
      finish(chatId, wrap, reply);
    } catch (e) {
      ended = true;
      if (e.name === "AbortError") { if (last) finish(chatId, wrap, last + "\n\n_(dihentikan)_"); else wrap.remove(); }
      else {
        var em = String(e.message || e), busy = /HTTP (429|5\d\d)|over capacity|rate limit/i.test(em);
        wrap.querySelector(".bubble").innerHTML = busy && built.vision
          ? '<p class="error">⚠️ Server analisis foto sedang penuh. Tunggu sekitar 1 menit, lalu kirim ulang pertanyaanmu (foto tetap tersimpan di chat ini).</p>'
          : '<p class="error">⚠️ Maaf, ' + (built.vision ? "foto gagal dianalisis" : "terjadi kesalahan saat menghubungi AI") + '. Silakan coba lagi.<br><small>' + esc(em.slice(0, 160)) + "</small></p>";
      }
    } finally { wrap.classList.remove("thinking"); controller = null; setBusy(false); }
  }
  function finish(chatId, wrap, reply) {
    var c = getChat(chatId); if (!c) return;
    c.messages.push({ role: "assistant", content: reply }); c.updated = Date.now(); save();
    if (currentId === chatId) setBot(wrap, reply, false);
    renderHistory();
  }
  function setBusy(b) {
    els.send.classList.toggle("stop", b);
    els.send.title = b ? "Hentikan" : "Kirim";
    els.send.innerHTML = b ? '<svg viewBox="0 0 24 24" width="16" height="16"><rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor"/></svg>'
      : '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M3.4 20.4 21 12 3.4 3.6 3.4 10.1 15 12 3.4 13.9z"/></svg>';
  }

  // ---------- Image generation ----------
  var imageMode = false, imageSize = localStorage.getItem("felix-img-size") || "persegi";
  var IMG_RE = [
    /^\/(?:gambar|image|img|foto|photo|draw)\s+([\s\S]+)/i,
    /^(?:tolong\s+|coba\s+|please\s+)?(?:buat(?:kan|in)?|bikin(?:kan|in)?|generate|generatekan|hasilkan|ciptakan|create|make|draw|lukis(?:kan)?)\s+(?:saya\s+|aku\s+|me\s+)?(?:sebuah\s+|satu\s+|a\s+|an\s+)?(gambar|foto|image|picture|photo|ilustrasi|lukisan|logo|poster|wallpaper)\s*(?:dari|tentang|of|yang|berupa|:)?\s*([\s\S]+)/i,
    /^gambarkan\s+([\s\S]+)/i
  ];
  function detectImageRequest(text) {
    for (var i = 0; i < IMG_RE.length; i++) {
      var m = text.match(IMG_RE[i]); if (!m) continue;
      var subj = (m[2] !== undefined ? m[2] : m[1]).trim();
      if (m[2] !== undefined && /^(ilustrasi|lukisan|logo|poster|wallpaper)$/i.test(m[1])) subj = m[1].toLowerCase() + " " + subj;
      if (subj.length > 1) return subj;
    }
    return null;
  }
  function buildImageUrl(prompt, size, seed) {
    var sz = CFG.IMAGE_SIZES[size] || CFG.IMAGE_SIZES.persegi;
    var u = CFG.IMAGE_URL_TEMPLATE.replace("{prompt}", encodeURIComponent(prompt))
      .replace("{width}", sz.width).replace("{height}", sz.height).replace("{seed}", seed)
      .replace("{model}", encodeURIComponent(CFG.IMAGE_MODEL || ""));
    return u.replace(/[?&]model=(?=&|$)/, function (m) { return m[0] === "?" ? "?" : ""; }).replace("?&", "?");
  }
  async function enhancePrompt(prompt, signal) {
    if (!CFG.IMAGE_ENHANCE_PROMPT) return prompt;
    var ctrl = new AbortController(), timer = setTimeout(function () { ctrl.abort(); }, CFG.IMAGE_ENHANCE_TIMEOUT_MS || 15000);
    var onAbort = function () { ctrl.abort(); }; if (signal) signal.addEventListener("abort", onAbort);
    var msgs = [
      { role: "system", content: "You convert image requests (any language) into one concise, vivid English prompt for an AI image generator (max 60 words). Keep the user's subject and intent, add useful details about style, lighting and composition. Output ONLY the prompt text, no quotes, no explanations." },
      { role: "user", content: prompt }
    ];
    try {
      var list = providers();
      for (var i = 0; i < list.length; i++) {
        var p = Object.assign({}, list[i], { wait: false });
        if (p.cooldown && Date.now() - (lastTextAt[p.name] || 0) < p.cooldown) continue; // jangan habiskan kuota chat gratis
        try {
          var res = await requestProvider(p, msgs, false, 0.6, ctrl.signal);
          var out = (await readReply(res, null, ctrl.signal)).trim().replace(/^["'`]+|["'`]+$/g, "");
          if (out && out.length < 800) return out;
        } catch (e) { if (ctrl.signal.aborted) break; }
      }
      if (signal && signal.aborted) { var ab = new Error("aborted"); ab.name = "AbortError"; throw ab; }
      return prompt;
    } catch (e) { if (signal && signal.aborted) throw e; return prompt; }
    finally { clearTimeout(timer); if (signal) signal.removeEventListener("abort", onAbort); }
  }
  function loadImage(url, signal, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var img = new Image(), t = setTimeout(function () { img.src = ""; reject(new Error("Waktu habis")); }, timeoutMs || 120000);
      img.onload = function () { clearTimeout(t); resolve(img); };
      img.onerror = function () { clearTimeout(t); reject(new Error("Gagal memuat gambar")); };
      if (signal) signal.addEventListener("abort", function () { clearTimeout(t); img.src = ""; var e = new Error("aborted"); e.name = "AbortError"; reject(e); });
      img.src = url;
    });
  }
  function imgLoadingHtml(size, text) {
    var sz = CFG.IMAGE_SIZES[size] || CFG.IMAGE_SIZES.persegi;
    return '<div class="gen-img"><div class="gen-frame" style="aspect-ratio:' + sz.width + "/" + sz.height +
      '"><div class="gen-loading"><div class="spin"></div><span class="gl-text">' + esc(text) + "</span></div></div></div>";
  }
  function renderImage(wrap, m) {
    var b = wrap.querySelector(".bubble"), acts = wrap.querySelector(".msg-actions");
    b.classList.remove("cursor");
    var sz = CFG.IMAGE_SIZES[m.size] || CFG.IMAGE_SIZES.persegi;
    b.innerHTML = '<div class="gen-img"><div class="gen-frame" style="aspect-ratio:' + sz.width + "/" + sz.height +
      '"><div class="gen-loading"><div class="spin"></div><span>Memuat gambar…</span></div><img alt=""></div>' +
      '<div class="gen-caption">🎨 <b></b></div></div>';
    var img = b.querySelector("img"), frame = b.querySelector(".gen-frame");
    img.alt = m.prompt; b.querySelector(".gen-caption b").textContent = m.prompt;
    img.onload = function () {
      var l = frame.querySelector(".gen-loading");
      requestAnimationFrame(function () { img.classList.add("loaded"); });
      if (l) { l.style.transition = "opacity .5s"; l.style.opacity = "0"; setTimeout(function () { l.remove(); frame.style.aspectRatio = ""; }, 500); }
      else frame.style.aspectRatio = "";
    };
    img.onerror = function () { frame.innerHTML = '<div class="gen-err">⚠️ Gambar tidak bisa dimuat. Coba buat ulang.</div>'; };
    img.src = m.url;
    acts.innerHTML = '<button data-act="dl">⬇️ Unduh</button><button data-act="open">🔍 Buka ukuran penuh</button><button data-act="again">🔄 Buat ulang</button>';
    acts.querySelector('[data-act="dl"]').onclick = function () { downloadImage(m.url, this); };
    acts.querySelector('[data-act="open"]').onclick = function () { window.open(m.url, "_blank", "noopener"); };
    acts.querySelector('[data-act="again"]').onclick = function () { if (!controller) sendImage("/gambar " + m.prompt, m.prompt, m.size); };
  }
  async function downloadImage(url, btn) {
    var label = btn.textContent; btn.textContent = "⏳ Mengunduh…";
    try {
      var r = await fetch(url); if (!r.ok) throw new Error();
      var blob = await r.blob(), a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = "felix-ai-" + Date.now() + ".jpg";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
      btn.textContent = "✅ Terunduh";
    } catch (e) { window.open(url, "_blank", "noopener"); btn.textContent = label; return; }
    setTimeout(function () { btn.textContent = label; }, 1500);
  }
  async function sendImage(text, prompt, size) {
    if (controller) return;
    size = size || imageSize;
    var c = getChat(currentId);
    if (!c) {
      c = { id: uid(), title: "🎨 " + prompt.slice(0, 36) + (prompt.length > 36 ? "…" : ""), messages: [], updated: Date.now() };
      chats.push(c); currentId = c.id; els.title.textContent = c.title;
    }
    c.messages.push({ role: "user", content: text }); c.updated = Date.now(); save(); renderHistory();
    addMsgEl("user", text); scrollDown(true);
    els.input.value = ""; autosize();
    var wrap = addMsgEl("assistant", ""), b = wrap.querySelector(".bubble");
    b.innerHTML = imgLoadingHtml(size, "Menyiapkan prompt…"); scrollDown(true);
    controller = new AbortController(); setBusy(true);
    var chatId = c.id, signal = controller.signal, stepTimer = null;
    try {
      var en = await enhancePrompt(prompt, signal);
      var steps = ["Sedang membuat gambar…", "Mencampur warna…", "Menambahkan detail…", "Mengatur cahaya…", "Hampir selesai…"], si = 0;
      var gl = b.querySelector(".gl-text"); if (gl) gl.textContent = steps[0];
      stepTimer = setInterval(function () { var g = b.querySelector(".gl-text"); if (g && si < steps.length - 1) g.textContent = steps[++si]; }, 3000);
      var url, lastErr;
      for (var attempt = 0; attempt < 3; attempt++) {
        url = buildImageUrl(en, size, Math.floor(Math.random() * 1e9));
        try { await loadImage(url, signal, 120000); lastErr = null; break; }
        catch (e) { if (e.name === "AbortError") throw e; lastErr = e; await new Promise(function (r) { setTimeout(r, 2000 * (attempt + 1)); }); }
      }
      if (lastErr) throw lastErr;
      var msg = { role: "assistant", type: "image", prompt: prompt, enPrompt: en, url: url, size: size,
        content: "[Felix AI membuat gambar: " + prompt + "]" };
      var cc = getChat(chatId);
      if (cc) { cc.messages.push(msg); cc.updated = Date.now(); save(); }
      if (currentId === chatId) renderImage(wrap, msg);
      renderHistory();
    } catch (e) {
      if (e.name === "AbortError") wrap.remove();
      else b.innerHTML = '<p class="error">⚠️ Maaf, gambar gagal dibuat. Silakan coba lagi.<br><small>' + esc(String(e.message || e)) + "</small></p>";
    } finally { clearInterval(stepTimer); controller = null; setBusy(false); }
  }
  function setImageMode(on) {
    imageMode = on;
    var t = $("imgToggle"); t.classList.toggle("on", on); t.setAttribute("aria-pressed", on ? "true" : "false");
    $("imageOpts").hidden = !on;
    els.input.placeholder = on ? "Jelaskan gambar yang ingin dibuat..." : (pending.length ? "Tanyakan sesuatu tentang foto ini..." : "Kirim pesan ke Felix AI...");
    els.input.focus();
  }
  $("imgToggle").onclick = function () { setImageMode(!imageMode); };
  Array.prototype.forEach.call(document.querySelectorAll(".size-chip"), function (chip) {
    chip.classList.toggle("active", chip.dataset.size === imageSize);
    chip.onclick = function () {
      imageSize = chip.dataset.size; localStorage.setItem("felix-img-size", imageSize);
      Array.prototype.forEach.call(document.querySelectorAll(".size-chip"), function (x) { x.classList.toggle("active", x === chip); });
    };
  });

  // ---------- UI events ----------
  function autosize() { els.input.style.height = "auto"; els.input.style.height = Math.min(els.input.scrollHeight, 200) + "px"; if (typeof updateSendReady === "function") updateSendReady(); }
  els.input.addEventListener("input", autosize);
  els.input.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(els.input.value); }
  });
  els.form.addEventListener("submit", function (e) { e.preventDefault(); if (controller) controller.abort(); else send(els.input.value); });
  Array.prototype.forEach.call(document.querySelectorAll(".suggestion"), function (b) {
    b.onclick = function () { send(b.dataset.prompt || b.textContent); };
    b.addEventListener("pointermove", function (e) {
      var r = b.getBoundingClientRect();
      b.style.setProperty("--mx", (e.clientX - r.left) + "px"); b.style.setProperty("--my", (e.clientY - r.top) + "px");
    });
  });
  function updateSendReady() { els.send.classList.toggle("ready", !!els.input.value.trim() || !!(pending && pending.length)); }

  // ---------- Lampiran foto (galeri / kamera / tempel / seret) ----------
  var pending = [], strip = $("attachStrip"), fileInput = $("fileInput"), VIS = CFG.VISION || {};
  var MAX_ATT = VIS.MAX_PER_MESSAGE || 4;
  function readImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("decode")); };
      img.src = url;
    });
  }
  function toJpeg(img, side, q) {
    var w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, side / Math.max(w, h));
    var cv = document.createElement("canvas"); cv.width = Math.max(1, Math.round(w * k)); cv.height = Math.max(1, Math.round(h * k));
    var ctx = cv.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.imageSmoothingQuality = "high"; ctx.drawImage(img, 0, 0, cv.width, cv.height);
    return cv.toDataURL("image/jpeg", q);
  }
  async function addFiles(list) {
    var files = Array.prototype.filter.call(list || [], function (f) { return /^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|bmp|heic|heif|avif)$/i.test(f.name || ""); });
    if (!files.length) { if (list && list.length) toast("⚠️ Hanya file foto yang bisa dilampirkan."); return; }
    var room = MAX_ATT - pending.length;
    if (room <= 0) { toast("Maksimal " + MAX_ATT + " foto per pesan."); return; }
    if (files.length > room) toast("Maksimal " + MAX_ATT + " foto per pesan — sebagian tidak ditambahkan.");
    if (imageMode) setImageMode(false);
    var items = files.slice(0, room).map(function () { var it = { id: uid(), loading: true }; pending.push(it); return it; });
    renderAttach();
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      try {
        var img = await readImage(files[i]);
        it.full = toJpeg(img, VIS.MAX_SIDE || 1280, VIS.QUALITY || 0.85);
        it.thumb = toJpeg(img, VIS.THUMB_SIDE || 480, VIS.THUMB_QUALITY || 0.72);
        it.loading = false;
      } catch (e) {
        pending = pending.filter(function (x) { return x !== it; });
        toast("⚠️ Foto \"" + (files[i].name || "foto") + "\" tidak bisa dibaca. Coba format JPG/PNG.");
      }
      renderAttach();
    }
  }
  function renderAttach() {
    strip.hidden = !pending.length; strip.innerHTML = "";
    pending.forEach(function (p) {
      var d = document.createElement("div"); d.className = "att" + (p.loading ? " loading" : "");
      d.innerHTML = p.loading ? '<div class="att-spin"></div>' : '<img alt="Foto terlampir">';
      if (!p.loading) { var im = d.querySelector("img"); im.src = p.thumb; im.onclick = function () { openLightbox(p.full); }; }
      var x = document.createElement("button"); x.type = "button"; x.className = "att-x"; x.title = "Hapus foto"; x.setAttribute("aria-label", "Hapus foto"); x.textContent = "✕";
      x.onclick = function () { pending = pending.filter(function (q) { return q !== p; }); renderAttach(); els.input.focus(); };
      d.appendChild(x); strip.appendChild(d);
    });
    if (pending.length && pending.length < MAX_ATT) {
      var add = document.createElement("button"); add.type = "button"; add.className = "att-add"; add.title = "Tambah foto"; add.setAttribute("aria-label", "Tambah foto"); add.textContent = "＋";
      add.onclick = function () { fileInput.click(); }; strip.appendChild(add);
    }
    $("attachBtn").classList.toggle("on", pending.length > 0);
    if (!imageMode) els.input.placeholder = pending.length ? "Tanyakan sesuatu tentang foto ini..." : "Kirim pesan ke Felix AI...";
    updateSendReady();
  }
  function clearAttachments() { pending = []; renderAttach(); }
  $("attachBtn").onclick = function () { fileInput.click(); };
  fileInput.onchange = function () { addFiles(fileInput.files); fileInput.value = ""; };
  els.input.addEventListener("paste", function (e) {
    var items = (e.clipboardData && e.clipboardData.items) || [], files = [];
    for (var i = 0; i < items.length; i++) if (items[i].kind === "file" && /^image\//.test(items[i].type)) { var f = items[i].getAsFile(); if (f) files.push(f); }
    if (files.length) { e.preventDefault(); addFiles(files); }
  });
  var dz = $("dropZone"), dragDepth = 0;
  function hasFiles(e) { return e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], "Files") >= 0; }
  document.addEventListener("dragenter", function (e) { if (!hasFiles(e)) return; e.preventDefault(); dragDepth++; dz.classList.add("show"); });
  document.addEventListener("dragover", function (e) { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = "copy"; });
  document.addEventListener("dragleave", function (e) { if (!hasFiles(e)) return; dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) dz.classList.remove("show"); });
  document.addEventListener("drop", function (e) { if (!hasFiles(e)) return; e.preventDefault(); dragDepth = 0; dz.classList.remove("show"); addFiles(e.dataTransfer.files); });
  var lb = $("lightbox");
  function openLightbox(src) {
    if (!src) return; lb.querySelector("img").src = src; lb.hidden = false;
    requestAnimationFrame(function () { lb.classList.add("show"); });
  }
  function closeLightbox() { lb.classList.remove("show"); setTimeout(function () { lb.hidden = true; }, 250); }
  lb.onclick = function (e) { if (e.target !== lb.querySelector("img")) closeLightbox(); };
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !lb.hidden) closeLightbox(); });
  els.input.addEventListener("input", updateSendReady);
  var reduceMotion = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches, greetTimer = null;
  function typeGreeting() {
    var g = $("greet"); if (!g) return;
    var full = g.dataset.text; clearTimeout(greetTimer);
    if (reduceMotion || els.welcome.style.display === "none") { g.textContent = full; g.classList.remove("typing-on"); return; }
    var i = 0; g.textContent = ""; g.classList.add("typing-on");
    (function step() {
      g.textContent = full.slice(0, ++i);
      if (i < full.length) greetTimer = setTimeout(step, 45 + Math.random() * 45);
      else greetTimer = setTimeout(function () { g.classList.remove("typing-on"); }, 1200);
    })();
  }
  $("newChat").onclick = newChat; $("newChatTop").onclick = newChat;
  function openSidebar() { els.sidebar.classList.add("open"); els.overlay.classList.add("show"); }
  function closeSidebar() { els.sidebar.classList.remove("open"); els.overlay.classList.remove("show"); }
  $("openSidebar").onclick = openSidebar; $("closeSidebar").onclick = closeSidebar; els.overlay.onclick = closeSidebar;
  $("clearAll").onclick = function () { if (confirm("Hapus semua riwayat chat?")) { chats = []; save(); newChat(); } };

  function applyTheme(t) {
    document.documentElement.dataset.theme = t; localStorage.setItem("felix-theme", t);
    $("themeIcon").textContent = t === "dark" ? "☀️" : "🌙";
    $("themeText").textContent = t === "dark" ? "Mode terang" : "Mode gelap";
  }
  $("themeToggle").onclick = function () {
    var h = document.documentElement; h.classList.add("theme-anim");
    clearTimeout(h._ta); h._ta = setTimeout(function () { h.classList.remove("theme-anim"); }, 600);
    applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"); };
  applyTheme(document.documentElement.dataset.theme || "dark");

  renderHistory();
  typeGreeting();
  els.input.focus();
})();
