(() => {
  "use strict";

  const FRAME_COUNT = 240;          // 10s @ 24fps, all frames kept
  const FRAME_SPEED = 2.0;          // 1.8-2.2: product animation completes by ~50% scroll
  const IMAGE_SCALE = 0.86;         // padded cover
  const BG = "#000000";             // page is pure black; canvas fill matches exactly
  const framePath = (i) => `frames/frame_${String(i + 1).padStart(4, "0")}.webp`;

  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d");
  const canvasWrap = document.querySelector(".canvas-wrap");
  const hero = document.querySelector(".hero");
  const scrollContainer = document.getElementById("scroll-container");
  const overlay = document.getElementById("dark-overlay");
  const loaderBar = document.getElementById("loader-bar");
  const loaderPercent = document.getElementById("loader-percent");

  gsap.registerPlugin(ScrollTrigger);

  /* ---------- 6a. Lenis smooth scroll ---------- */
  let lenis = null;
  if (!reduceMotion) {
    lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    });
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
    lenis.stop(); // until frames are loaded
    window.__lenis = lenis;
  }

  /* ---------- 6b. Frame preloader (two-phase) ---------- */
  const frames = new Array(FRAME_COUNT);
  let loaded = 0;

  function loadFrame(i) {
    return new Promise((resolve) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = img.onerror = () => {
        frames[i] = img.naturalWidth ? img : null;
        loaded++;
        const pct = Math.round((loaded / FRAME_COUNT) * 100);
        loaderBar.style.transform = `scaleX(${loaded / FRAME_COUNT})`;
        loaderPercent.textContent = `${pct}%`;
        resolve();
      };
      img.src = framePath(i);
    });
  }

  async function preload() {
    const first = Math.min(10, FRAME_COUNT);
    await Promise.all(Array.from({ length: first }, (_, i) => loadFrame(i)));
    resizeCanvas();
    drawFrame(0);
    const rest = [];
    for (let i = first; i < FRAME_COUNT; i++) rest.push(loadFrame(i));
    await Promise.all(rest);
  }

  /* ---------- 6c. Canvas renderer, padded cover ---------- */
  let currentFrame = 0;
  // Shoe glides away from whichever side the copy is on: x is -1 (left) .. 1 (right)
  const shoe = { x: 0, s: 1 };
  const SHOE_SHIFT = 0.19;          // fraction of viewport width
  const SHOE_SHRINK = 0.88;         // scale while shifted

  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(innerWidth * dpr);
    canvas.height = Math.round(innerHeight * dpr);
    drawFrame(currentFrame);
  }

  function drawFrame(index) {
    let img = frames[index];
    // fall back to the nearest loaded frame so the canvas never flashes empty
    for (let d = 1; !img && d < FRAME_COUNT; d++) img = frames[index - d] || frames[index + d];
    const cw = canvas.width, ch = canvas.height;
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, cw, ch);
    if (!img) return;
    const iw = img.naturalWidth, ih = img.naturalHeight;
    const mobile = innerWidth < 768;
    const scale = mobile
      ? Math.min(cw / iw, ch / ih) * 1.25
      : Math.max(cw / iw, ch / ih) * IMAGE_SCALE * shoe.s;
    const dw = iw * scale, dh = ih * scale;
    const dx = (cw - dw) / 2 + (mobile ? 0 : shoe.x * SHOE_SHIFT * cw);
    const dy = (ch - dh) / 2 - (mobile ? ch * 0.2 : 0);
    ctx.drawImage(img, dx, dy, dw, dh);

    // Radial vignette over the frame so its edges always dissolve into #000
    const cx = dx + dw / 2, cy = dy + dh / 2;
    const g = ctx.createRadialGradient(cx, cy, Math.min(dw, dh) * 0.42, cx, cy, Math.max(dw, dh) * 0.56);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, BG);
    ctx.fillStyle = g;
    ctx.fillRect(dx - 2, dy - 2, dw + 4, dh + 4);
  }

  let shoeSide = 0;
  function setShoeSide(side) {
    if (side === shoeSide) return;
    shoeSide = side;
    gsap.to(shoe, {
      x: side, s: side === 0 ? 1 : SHOE_SHRINK,
      duration: reduceMotion ? 0 : 1.3, ease: "power3.inOut", overwrite: true,
      onUpdate: () => drawFrame(currentFrame),
    });
  }

  window.addEventListener("resize", () => { resizeCanvas(); ScrollTrigger.refresh(); });

  /* ---------- Section animation system ---------- */
  const CHILDREN = ".section-label, .section-heading, .section-body, .section-note, .cta-button, .stats-heading, .stat, .gallery-item, .cta-product";

  function buildTimeline(section) {
    const children = section.querySelectorAll(CHILDREN);
    const tl = gsap.timeline({ paused: true });
    tl.fromTo(section, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.01 });
    const base = { opacity: 0, stagger: 0.12, duration: 0.9, ease: "power3.out" };

    switch (section.dataset.animation) {
      case "fade-up":     tl.from(children, { ...base, y: 50 }); break;
      case "slide-left":  tl.from(children, { ...base, x: -80, stagger: 0.14 }); break;
      case "slide-right": tl.from(children, { ...base, x: 80, stagger: 0.14 }); break;
      case "scale-up":    tl.from(children, { ...base, scale: 0.85, duration: 1.0, ease: "power2.out", transformOrigin: "left center" }); break;
      case "rotate-in":   tl.from(children, { ...base, y: 40, rotation: 3, stagger: 0.1 }); break;
      case "stagger-up":  tl.from(children, { ...base, y: 60, stagger: 0.15, duration: 0.8 }); break;
      case "clip-reveal": tl.from(children, { ...base, clipPath: "inset(100% 0 0 0)", stagger: 0.15, duration: 1.2, ease: "power4.inOut" }); break;
    }
    return tl;
  }

  /* ---------- 6f. Counters (run when the stats section becomes active) ---------- */
  function runCounters(section) {
    section.querySelectorAll(".stat-number").forEach((el) => {
      const target = parseFloat(el.dataset.value);
      const decimals = parseInt(el.dataset.decimals || "0", 10);
      const obj = { v: 0 };
      gsap.killTweensOf(obj);
      gsap.to(obj, {
        v: target, duration: reduceMotion ? 0 : 2, ease: "power2.out", delay: 0.2,
        onUpdate: () => { el.textContent = obj.v.toFixed(decimals); },
      });
    });
  }

  const sections = [...document.querySelectorAll(".scroll-section")].map((el) => ({
    el,
    enter: parseFloat(el.dataset.enter) / 100,
    leave: parseFloat(el.dataset.leave) / 100,
    persist: el.dataset.persist === "true",
    tl: buildTimeline(el),
    active: false,
  }));

  function updateSections(p) {
    sections.forEach((s) => {
      const shouldBeActive = p >= s.enter && (s.persist || p < s.leave);
      if (shouldBeActive === s.active) return;
      s.active = shouldBeActive;
      s.el.classList.toggle("is-active", shouldBeActive);
      if (shouldBeActive) {
        s.tl.timeScale(1).play();
        if (s.el.querySelector(".stat-number")) runCounters(s.el);
      } else {
        s.tl.timeScale(2.2).reverse();
      }
    });
  }

  /* ---------- 6h. Dark overlay (stats + gallery + CTA, which shows the product photo instead of the video frame) ---------- */
  const overlayRanges = sections
    .filter((s) => s.el.matches(".section-stats, .section-gallery, .section-cta"))
    .map((s) => ({ enter: s.enter, leave: s.persist ? Infinity : s.leave, max: s.el.matches(".section-stats") ? 0.94 : 1 }));
  const FADE = 0.03;

  function overlayOpacity(p) {
    for (const r of overlayRanges) {
      if (p >= r.enter - FADE && p < r.enter) return r.max * ((p - (r.enter - FADE)) / FADE);
      if (p >= r.enter && p <= r.leave) return r.max;
      if (p > r.leave && p <= r.leave + FADE) return r.max * (1 - (p - r.leave) / FADE);
    }
    return 0;
  }

  /* ---------- 6g. Marquee ---------- */
  const marquees = [...document.querySelectorAll(".marquee-wrap")].map((el) => ({
    el,
    text: el.querySelector(".marquee-text"),
    speed: parseFloat(el.dataset.scrollSpeed) || -25,
    enter: parseFloat(el.dataset.enter) / 100,
    leave: parseFloat(el.dataset.leave) / 100,
  }));

  function updateMarquees(p) {
    marquees.forEach((m) => {
      const local = gsap.utils.clamp(0, 1, (p - m.enter) / (m.leave - m.enter));
      const edge = 0.15;
      const fade = local <= 0 || local >= 1 ? 0 : Math.min(1, local / edge, (1 - local) / edge);
      m.el.style.opacity = fade;
      m.text.style.transform = `translate3d(${local * m.speed}%, 0, 0)`;
    });
  }

  /* ---------- 6i. Hero fade + circle-wipe canvas reveal ---------- */
  function updateHero(p) {
    const heroOpacity = Math.max(0, 1 - p * 15);
    hero.style.opacity = heroOpacity;
    hero.style.visibility = heroOpacity <= 0 ? "hidden" : "visible";
    hero.querySelector(".hero-inner").style.transform = `translate3d(0, ${-p * 600}px, 0)`;
    const wipe = Math.min(1, Math.max(0, (p - 0.01) / 0.06));
    canvasWrap.style.clipPath = wipe >= 1 ? "none" : `circle(${wipe * 75}% at 50% 50%)`;
  }

  /* ---------- 6d. One master scroll driver ---------- */
  function onProgress(p) {
    const accelerated = Math.min(p * FRAME_SPEED, 1);
    const index = Math.min(Math.floor(accelerated * FRAME_COUNT), FRAME_COUNT - 1);
    if (index !== currentFrame) {
      currentFrame = index;
      requestAnimationFrame(() => drawFrame(currentFrame));
    }
    updateHero(p);
    overlay.style.opacity = overlayOpacity(p);
    updateMarquees(p);
    updateSections(p);

    // copy on the left pushes the shoe right, and vice versa
    const side = sections.find((s) => s.active && s.el.matches(".align-left, .align-right"));
    setShoeSide(!side ? 0 : side.el.classList.contains("align-left") ? 1 : -1);
  }

  function initScroll() {
    ScrollTrigger.create({
      trigger: scrollContainer,
      start: "top top",
      end: "bottom bottom",
      scrub: true,
      onUpdate: (self) => onProgress(self.progress),
      onRefresh: (self) => onProgress(self.progress),
    });
  }

  /* ---------- Hero entrance (the one orchestrated load moment) ---------- */
  function heroIntro() {
    if (reduceMotion) return;
    gsap.timeline({ defaults: { ease: "power4.out" } })
      .to(".hero-heading .word > span", { yPercent: 0, duration: 1.3, stagger: 0.12, delay: 0.3 })
      .from(".hero-kicker, .hero-tagline, .scroll-cue", { opacity: 0, y: 20, duration: 0.9, stagger: 0.1 }, "-=0.8")
      .from(".hero-glow", { opacity: 0, duration: 1.6, ease: "power2.out" }, 0);
  }

  /* ---------- Nav jumps ---------- */
  document.querySelectorAll("[data-jump]").forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      const top = scrollContainer.offsetTop;
      const range = scrollContainer.offsetHeight - innerHeight;
      const y = top + range * parseFloat(a.dataset.jump);
      if (lenis) lenis.scrollTo(y, { duration: 1.8 });
      else window.scrollTo({ top: y });
    });
  });
  document.querySelector(".logo").addEventListener("click", (e) => {
    e.preventDefault();
    if (lenis) lenis.scrollTo(0, { duration: 1.8 }); else window.scrollTo({ top: 0 });
  });

  /* ---------- Size picker + add to bag ---------- */
  const sizeButtons = [...document.querySelectorAll(".size-picker button")];
  const addBtn = document.getElementById("add-to-bag");
  const status = document.getElementById("cta-status");
  const selectedSize = () => sizeButtons.find((b) => b.getAttribute("aria-checked") === "true").textContent;

  sizeButtons.forEach((btn, i) => {
    btn.addEventListener("click", () => {
      sizeButtons.forEach((b) => b.setAttribute("aria-checked", String(b === btn)));
      addBtn.textContent = `Add size ${btn.textContent} to bag`;
      status.textContent = "";
    });
    btn.addEventListener("keydown", (e) => {
      const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
      if (!dir) return;
      e.preventDefault();
      const next = sizeButtons[(i + dir + sizeButtons.length) % sizeButtons.length];
      next.focus();
      next.click();
    });
  });
  addBtn.addEventListener("click", () => {
    status.textContent = `Added size ${selectedSize()} to your bag.`;
  });

  /* ---------- Boot ---------- */
  resizeCanvas();
  if (!reduceMotion) gsap.set(".hero-heading .word > span", { yPercent: 105 });
  preload().then(() => {
    document.body.classList.add("is-loaded");
    heroIntro();
    if (lenis) lenis.start();
    initScroll();
    drawFrame(currentFrame);
  });
})();
