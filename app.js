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
  function save() { try { localStorage.setItem(STORE, JSON.stringify(chats)); } catch (e) {} }
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

  function addMsgEl(role, content) {
    els.welcome.style.display = "none";
    var wrap = document.createElement("div");
    wrap.className = "msg " + (role === "user" ? "user" : "bot");
    if (role === "user") {
      wrap.innerHTML = '<div class="bubble"></div>';
      wrap.querySelector(".bubble").textContent = content;
    } else {
      wrap.innerHTML = '<img class="avatar" src="logo.svg" alt="Felix"><div style="flex:1;min-width:0"><div class="bubble"></div><div class="msg-actions"></div></div>';
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
    els.welcome.style.display = c.messages.length ? "none" : "";
    c.messages.forEach(function (m) { addMsgEl(m.role, m.content); });
    els.title.textContent = c.title || "Felix AI";
    renderHistory(); scrollDown(true);
  }
  function newChat() {
    if (controller) controller.abort();
    currentId = null; clearMessages(); els.welcome.style.display = "";
    els.title.textContent = "Felix AI"; renderHistory(); closeSidebar(); els.input.focus();
  }

  // ---------- AI call ----------
  async function callAI(history, onDelta, signal) {
    var headers = { "Content-Type": "application/json" };
    if (CFG.API_KEY) headers["Authorization"] = "Bearer " + CFG.API_KEY;
    var body = {
      model: CFG.MODEL, stream: !!CFG.STREAM, temperature: CFG.TEMPERATURE, seed: Math.floor(Math.random() * 1e9),
      messages: [{ role: "system", content: CFG.SYSTEM_PROMPT }].concat(history.slice(-CFG.MAX_HISTORY))
    };
    var res, tries = 0;
    while (true) {
      res = await fetch(CFG.API_URL, { method: "POST", headers: headers, body: JSON.stringify(body), signal: signal });
      if ((res.status === 429 || res.status >= 500) && tries < 3) { tries++; await new Promise(function (r) { setTimeout(r, 2500 * tries); }); continue; }
      break;
    }
    if (!res.ok) { var t = ""; try { t = await res.text(); } catch (e) {} throw new Error("HTTP " + res.status + (t ? ": " + t.slice(0, 200) : "")); }
    var ctype = res.headers.get("content-type") || "";
    if (!CFG.STREAM || !res.body || ctype.indexOf("event-stream") < 0) {
      var j = await res.json();
      var txt = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || "";
      await typeOut(txt, onDelta, signal);
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
          if (delta && typeof delta.content === "string" && delta.content) { full += delta.content; onDelta(full); }
        } catch (e) {}
      }
    }
    return full;
  }
  async function typeOut(txt, onDelta, signal) { // efek mengetik jika respons non-streaming
    for (var i = 0; i <= txt.length; i += 4) { if (signal.aborted) return; onDelta(txt.slice(0, i)); await new Promise(function (r) { setTimeout(r, 8); }); }
    onDelta(txt);
  }

  async function send(text) {
    text = text.trim(); if (!text || controller) return;
    var c = getChat(currentId);
    if (!c) {
      c = { id: uid(), title: text.slice(0, 40) + (text.length > 40 ? "…" : ""), messages: [], updated: Date.now() };
      chats.push(c); currentId = c.id; els.title.textContent = c.title;
    }
    c.messages.push({ role: "user", content: text }); c.updated = Date.now(); save(); renderHistory();
    addMsgEl("user", text); scrollDown(true);
    els.input.value = ""; autosize();

    var wrap = addMsgEl("assistant", "");
    wrap.querySelector(".bubble").innerHTML = '<div class="typing"><span></span><span></span><span></span></div>';
    controller = new AbortController(); setBusy(true);
    var chatId = c.id, last = "", pending = false, ended = false;
    try {
      var reply = await callAI(c.messages.map(function (m) { return { role: m.role, content: m.content }; }), function (partial) {
        last = partial;
        if (!pending) { pending = true; requestAnimationFrame(function () { pending = false; if (ended) return; setBot(wrap, last, true); scrollDown(); }); }
      }, controller.signal);
      ended = true;
      if (!reply) reply = "_(Tidak ada jawaban. Silakan coba lagi.)_";
      finish(chatId, wrap, reply);
    } catch (e) {
      ended = true;
      if (e.name === "AbortError") { if (last) finish(chatId, wrap, last + "\n\n_(dihentikan)_"); else wrap.remove(); }
      else {
        wrap.querySelector(".bubble").innerHTML = '<p class="error">⚠️ Maaf, terjadi kesalahan saat menghubungi AI. Silakan coba lagi.<br><small>' + esc(String(e.message || e)) + "</small></p>";
      }
    } finally { controller = null; setBusy(false); }
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

  // ---------- UI events ----------
  function autosize() { els.input.style.height = "auto"; els.input.style.height = Math.min(els.input.scrollHeight, 200) + "px"; }
  els.input.addEventListener("input", autosize);
  els.input.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(els.input.value); }
  });
  els.form.addEventListener("submit", function (e) { e.preventDefault(); if (controller) controller.abort(); else send(els.input.value); });
  Array.prototype.forEach.call(document.querySelectorAll(".suggestion"), function (b) { b.onclick = function () { send(b.textContent); }; });
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
  $("themeToggle").onclick = function () { applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"); };
  applyTheme(document.documentElement.dataset.theme || "dark");

  renderHistory();
  els.input.focus();
})();
