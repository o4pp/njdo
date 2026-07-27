/* نجد — Najd app logic (vanilla JS) */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const toastEl = $("#toast");
  let toastTimer;
  const toast = (m) => {
    toastEl.textContent = m;
    toastEl.classList.add("on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("on"), 1800);
  };
  /* ---------- data ---------- */
  const FRIENDS = [
    { n: "فيصل العتيبي", h: "faisal", m: "وش رايك نطلع البر؟", t: "٢د", new: true },
    { n: "سارة القحطاني", h: "sarah", m: "أرسلت لقطة 📸", t: "٨د", new: true },
    { n: "عبدالله النجدي", h: "abdullah", m: "الله يعطيك العافية", t: "٢٥د" },
    { n: "منيرة الدوسري", h: "munira", m: "شفتي قصة الدرعية؟", t: "١س" },
    { n: "تركي الشمّري", h: "turki", m: "على حساب القهوة ☕", t: "٣س" },
    { n: "ريم الحربي", h: "reem", m: "بكرة نلتقي بالعليا", t: "أمس" },
    { n: "شباب نجد 🏜️", h: "group", m: "خالد: يالله موعدنا الخميس", t: "أمس" },
  ];
  const LENSES = ["نجدي", "شماغ", "قهوة", "نخل", "رمال", "درعية", "ليل", "كلاسيك"];
  const DISCOVER = [
    ["الدرعية التاريخية", "#7a4a24"],
    ["ليالي الرياض", "#243a5e"],
    ["قهوة نجدية", "#6b4326"],
    ["رمال الثمامة", "#8a6b2a"],
  ];
  const REPLIES = ["هلا والله 👋", "أبشر", "على راسي", "وش صار بعدين؟", "الله يعافيك", "يا هلا بك بنجد 🏜️", "تم، نتواصل"];
  const store = {
    get(k, d) { try { return JSON.parse(localStorage.getItem("najd:" + k)) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem("najd:" + k, JSON.stringify(v)); } catch {} },
  };
  const threads = store.get("threads", {});
  /* ---------- navigation ---------- */
  const go = (name) => {
    $$(".screen").forEach((s) => s.classList.toggle("is-active", s.dataset.screen === name));
    $$("#tabbar button").forEach((b) => b.classList.toggle("is-active", b.dataset.goto === name));
    if (name === "camera") startCam();
    if (name === "chats") $("#chatDot").classList.remove("on");
  };
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-goto]");
    if (b) go(b.dataset.goto);
  });
  /* ---------- camera ---------- */
  const video = $("#cam");
  const fallback = $("#camFallback");
  let stream = null;
  let facing = "user";
  async function startCam() {
    if (stream) return;
    if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) return;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing }, audio: false });
      video.srcObject = stream;
      video.classList.toggle("mirror", facing === "user");
      fallback.classList.add("hide");
    } catch {
      stream = null;
    }
  }
  function stopCam() {
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  $("#enableCam").addEventListener("click", async () => {
    await startCam();
    if (!stream) toast("الكاميرا غير متاحة هنا");
  });
  $("#flipBtn").addEventListener("click", async () => {
    facing = facing === "user" ? "environment" : "user";
    stopCam();
    await startCam();
    toast(facing === "user" ? "الكاميرا الأمامية" : "الكاميرا الخلفية");
  });
  $("#flashBtn").addEventListener("click", (e) => {
    e.currentTarget.classList.toggle("on");
    toast(e.currentTarget.classList.contains("on") ? "الفلاش مفعّل" : "الفلاش مغلق");
  });
  // lenses
  const rail = $("#lensRail");
  LENSES.forEach((l, i) => {
    const b = document.createElement("button");
    b.className = "lens" + (i === 0 ? " is-active" : "");
    b.textContent = l;
    b.addEventListener("click", () => {
      $$(".lens", rail).forEach((x) => x.classList.remove("is-active"));
      b.classList.add("is-active");
      const filters = ["none", "sepia(.4) saturate(1.3)", "contrast(1.2) sepia(.2)", "saturate(1.5)", "sepia(.6)", "grayscale(.4) contrast(1.1)", "brightness(.8) hue-rotate(200deg)", "none"];
      video.style.filter = filters[i] || "none";
      toast("عدسة " + l);
    });
    rail.appendChild(b);
  });
  // shutter
  const canvas = $("#shot");
  $("#shutter").addEventListener("click", () => {
    const w = 720, h = 1280;
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (stream && video.videoWidth) {
      const vw = video.videoWidth, vh = video.videoHeight;
      const s = Math.max(w / vw, h / vh);
      const dw = vw * s, dh = vh * s;
      ctx.filter = video.style.filter || "none";
      if (facing === "user") { ctx.translate(w, 0); ctx.scale(-1, 1); }
      ctx.drawImage(video, (w - dw) / 2, (h - dh) / 2, dw, dh);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    } else {
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, "#e2a33c"); g.addColorStop(1, "#3a2a14");
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    }
    ctx.filter = "none";
    ctx.font = "700 46px Tajawal, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,.92)";
    ctx.textAlign = "center";
    ctx.fillText("نجد 🏜️", w / 2, h - 90);
    $("#previewImg").src = canvas.toDataURL("image/jpeg", 0.9);
    $("#preview").hidden = false;
  });
  $("#discardShot").addEventListener("click", () => ($("#preview").hidden = true));
  $("#sendShot").addEventListener("click", () => {
    $("#preview").hidden = true;
    $("#chatDot").classList.add("on");
    toast("تم إرسال اللقطة ✅");
  });
  /* ---------- chats ---------- */
  const initials = (n) => n.trim().charAt(0);
  const chatList = $("#chatList");
  function renderChats(q = "") {
    chatList.innerHTML = "";
    FRIENDS.filter((f) => f.n.includes(q)).forEach((f) => {
      const li = document.createElement("li");
      li.className = "row";
      li.innerHTML = `<span class="ava">${initials(f.n)}</span>
        <span class="row__t"><b>${f.n}</b><span class="${f.new ? "new" : ""}">${f.m}</span></span>
        <span class="row__m">${f.t}</span>`;
      li.addEventListener("click", () => openRoom(f));
      chatList.appendChild(li);
    });
    if (!chatList.children.length) chatList.innerHTML = `<li class="row"><span class="row__t"><b>لا نتائج</b></span></li>`;
  }
  $("#chatSearch").addEventListener("input", (e) => renderChats(e.target.value.trim()));
  renderChats();
  let current = null;
  const bubbles = $("#bubbles");
  function openRoom(f) {
    current = f;
    $("#roomName").textContent = f.n;
    $("#roomAva").textContent = initials(f.n);
    if (!threads[f.h]) threads[f.h] = [{ who: "them", t: f.m }];
    drawBubbles();
    go("room");
  }
  function drawBubbles() {
    bubbles.innerHTML = "";
    threads[current.h].forEach((m) => {
      const d = document.createElement("div");
      d.className = "b " + m.who;
      d.textContent = m.t;
      bubbles.appendChild(d);
    });
    bubbles.scrollTop = bubbles.scrollHeight;
  }
  $("#composer").addEventListener("submit", (e) => {
    e.preventDefault();
    const inp = $("#msgInput");
    const v = inp.value.trim();
    if (!v || !current) return;
    threads[current.h].push({ who: "me", t: v });
    inp.value = "";
    drawBubbles();
    store.set("threads", threads);
    setTimeout(() => {
      threads[current.h].push({ who: "them", t: REPLIES[Math.floor(Math.random() * REPLIES.length)] });
      store.set("threads", threads);
      if ($('.screen--room').classList.contains("is-active")) drawBubbles();
    }, 900);
  });
  /* ---------- stories ---------- */
  $("#myStory").innerHTML = `<div class="story-wide"><span class="ava">ن</span>
    <span class="row__t"><b>أضف إلى قصتي</b><span>شارك لحظتك مع أصدقائك</span></span></div>`;
  $("#myStory").addEventListener("click", () => go("camera"));
  const fs = $("#friendStories");
  FRIENDS.slice(0, 6).forEach((f, i) => {
    const b = document.createElement("button");
    b.className = "tile";
    b.style.background = `linear-gradient(160deg, hsl(${28 + i * 14} 55% ${26 + i * 4}%), #14110c)`;
    b.innerHTML = `<b>${f.n}</b>`;
    b.addEventListener("click", () => toast("قصة " + f.n));
    fs.appendChild(b);
  });
  const dc = $("#discover");
  DISCOVER.forEach(([t, c]) => {
    const b = document.createElement("button");
    b.className = "tile";
    b.style.background = `linear-gradient(160deg, ${c}, #100e0a)`;
    b.innerHTML = `<b>${t}</b>`;
    b.addEventListener("click", () => toast(t));
    dc.appendChild(b);
  });
  /* ---------- map ---------- */
  const map = $("#mapCanvas");
  const pos = [[22, 30], [58, 22], [38, 55], [70, 62], [18, 70]];
  FRIENDS.slice(0, 5).forEach((f, i) => {
    const p = document.createElement("button");
    p.className = "pin";
    p.style.insetInlineStart = pos[i][0] + "%";
    p.style.top = pos[i][1] + "%";
    p.style.animationDelay = i * 0.3 + "s";
    p.textContent = initials(f.n);
    p.addEventListener("click", () => toast(f.n + " · بالقرب منك"));
    map.appendChild(p);
  });
  const nb = $("#nearby");
  FRIENDS.slice(0, 6).forEach((f, i) => {
    const d = document.createElement("div");
    d.innerHTML = `<span class="ava">${initials(f.n)}</span>${f.n.split(" ")[0]}<br>${(i + 1) * 2} كم`;
    nb.appendChild(d);
  });
  document.addEventListener("visibilitychange", () => { if (document.hidden) stopCam(); });
  go("camera");
})();
