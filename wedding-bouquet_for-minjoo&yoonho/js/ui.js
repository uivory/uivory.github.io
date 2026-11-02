import { placeholderCanvas } from './wall.js';

const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 사생활 보호 모드 등 */ } },
};

export function createUI({ site, letters, photos, music, flowerInfo, hooks }) {
  /* ───── 문구 ───── */
  $('site-title').textContent = site.title;
  document.title = site.title;
  $('site-sub').textContent = site.subtitle;
  $('read-total').textContent = letters.length;

  /* ───── toast / pop ───── */
  let toastTimer;
  function toast(msg, ms = 2600) {
    const el = $('toast');
    el.textContent = msg; el.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), ms);
  }
  function pop(x, y, text, say = false) {
    const el = document.createElement('span');
    el.className = 'pop' + (say ? ' say' : '');
    el.textContent = text; el.style.left = x + 'px'; el.style.top = y + 'px';
    $('pops').appendChild(el);
    setTimeout(() => el.remove(), 1400);
  }

  /* ───── 콘페티 ───── */
  const cv = document.createElement('canvas');
  cv.id = 'confetti';
  document.body.appendChild(cv);
  const cx2 = cv.getContext('2d');
  let bits = [], confettiOn = false;
  function confetti(x, y, { count = 140, colors = ['#ffffff', '#fffdf6', '#f6f4ec', '#ffffff'] } = {}) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
    cx2.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (let i = 0; i < count; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.9;
      const v = 6 + Math.random() * 9;
      bits.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, w: 6 + Math.random() * 7, h: 4 + Math.random() * 6,
        r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, flip: Math.random() * 6, vf: 0.1 + Math.random() * 0.2,
        c: colors[i % colors.length], round: Math.random() < 0.3, life: 0,
      });
    }
    if (!confettiOn) { confettiOn = true; requestAnimationFrame(tickConfetti); }
  }
  function tickConfetti() {
    cx2.clearRect(0, 0, innerWidth, innerHeight);
    bits = bits.filter((b) => b.y < innerHeight + 30 && b.life < 320);
    bits.forEach((b) => {
      b.life++; b.vy += 0.22; b.vx *= 0.985; b.vy *= 0.985;
      b.x += b.vx + Math.sin(b.life * 0.07 + b.r) * 0.6; b.y += b.vy; b.r += b.vr; b.flip += b.vf;
      cx2.save(); cx2.translate(b.x, b.y); cx2.rotate(b.r); cx2.scale(1, Math.cos(b.flip));
      cx2.fillStyle = b.c; cx2.shadowColor = 'rgba(70,60,40,.28)'; cx2.shadowBlur = 3; cx2.shadowOffsetY = 1;
      if (b.round) { cx2.beginPath(); cx2.arc(0, 0, b.w / 2.6, 0, Math.PI * 2); cx2.fill(); }
      else cx2.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
      cx2.restore();
    });
    if (bits.length) requestAnimationFrame(tickConfetti);
    else { confettiOn = false; cx2.clearRect(0, 0, innerWidth, innerHeight); }
  }
  function rain(text, n = 18) {
    for (let i = 0; i < n; i++) {
      setTimeout(() => pop(Math.random() * innerWidth, innerHeight * (0.35 + Math.random() * 0.5), text), i * 70);
    }
  }

  /* ───── 읽은 편지 ───── */
  const readSet = new Set(store.get('bouquet.read.v1', []));
  function updateProgress() {
    $('read-count').textContent = readSet.size;
    $('progress').hidden = readSet.size === 0;
    if (readSet.size > 0) $('hint').classList.add('gone');
  }
  updateProgress();

  /* ───── 편지 시트 ───── */
  // 손글씨 폰트 4종을 편지마다 랜덤으로 (한 번 열면 같은 편지는 같은 글씨체 유지)
  const HANDS = [
    { family: 'NanumSonPyeonJi', size: '27px' },
    { family: 'NanumGyuriDiary', size: '27px' },
    { family: 'NanumParkKyungA', size: '26px' },
    { family: 'NanumAgiSarang', size: '27px' },
  ];
  const letterHand = letters.map(() => HANDS[Math.floor(Math.random() * HANDS.length)]);
  // 첫 화면이 뜬 뒤 폰트를 미리 받아둠
  setTimeout(() => HANDS.forEach((h) => document.fonts?.load(`20px "${h.family}"`).catch(() => {})), 2500);
  let cur = -1;
  const sheet = $('letter');
  const paper = $('paper');
  function renderLetter(i, animate) {
    const l = letters[i];
    const hand = letterHand[i];
    paper.style.setProperty('--letter-font', `"${hand.family}", var(--hand)`);
    paper.style.setProperty('--letter-size', hand.size);
    const chip = $('letter-chip');
    chip.textContent = 'From.';
    const name = document.createElement('b');
    name.textContent = l.from;
    chip.appendChild(name);
    $('letter-body').textContent = l.text;
    $('letter-count').textContent = `${i + 1} / ${letters.length}`;
    paper.scrollTop = 0;
    if (animate) { paper.classList.remove('swap'); void paper.offsetWidth; paper.classList.add('swap'); }
  }
  function openLetter(i) {
    const wasOpen = cur >= 0;
    cur = (i + letters.length) % letters.length;
    renderLetter(cur, wasOpen);
    sheet.classList.add('open'); sheet.setAttribute('aria-hidden', 'false');
    document.body.classList.add('reading');
    if (!readSet.has(cur)) { readSet.add(cur); store.set('bouquet.read.v1', [...readSet]); updateProgress(); hooks.onRead?.(cur); }
    hooks.onLetter?.(cur);
  }
  function closeLetter() {
    if (cur < 0) return;
    cur = -1;
    sheet.classList.remove('open'); sheet.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('reading');
    hooks.onLetterClose?.();
  }
  $('letter-close').onclick = closeLetter;
  // 좌우로 밀어서 이전/다음 편지, 아래로 쓸어내려 닫기
  {
    let x0 = null, y0 = 0, dx = 0, dy = 0, axis = null;
    paper.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      x0 = e.clientX; y0 = e.clientY; dx = dy = 0; axis = null;
    });
    paper.addEventListener('pointermove', (e) => {
      if (x0 === null) return;
      dx = e.clientX - x0; dy = e.clientY - y0;
      if (!axis && Math.hypot(dx, dy) > 10) axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (axis === 'x') {
        paper.style.transition = 'none';
        paper.style.transform = `translateX(${dx}px) rotate(${-0.6 + dx * 0.012}deg)`;
        paper.style.opacity = String(1 - Math.min(0.5, Math.abs(dx) / 500));
      } else if (axis === 'y' && dy > 0 && paper.scrollTop === 0) {
        paper.style.transition = 'none';
        paper.style.transform = `translateY(${dy}px) rotate(-.6deg)`;
      }
    });
    const end = () => {
      if (x0 === null) return;
      x0 = null;
      if (axis === 'x' && Math.abs(dx) > 60) { flip(dx < 0 ? 1 : -1); return; }
      paper.style.transition = ''; paper.style.transform = ''; paper.style.opacity = '';
      if (axis === 'y' && dy > 80 && paper.scrollTop === 0) closeLetter();
    };
    paper.addEventListener('pointerup', end);
    paper.addEventListener('pointercancel', end);
    // 트랙패드/마우스 가로 스크롤
    let wheelLock = 0;
    paper.addEventListener('wheel', (e) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) || Math.abs(e.deltaX) < 25) return;
      e.preventDefault();
      const now = performance.now();
      if (now < wheelLock) return;
      wheelLock = now + 600;
      flip(e.deltaX > 0 ? 1 : -1);
    }, { passive: false });
  }
  /** 편지를 옆으로 밀어내고 다음/이전 편지를 반대편에서 들여옴 */
  function flip(dir) {
    if (cur < 0) return;
    paper.style.transition = 'transform .2s ease-in, opacity .2s';
    paper.style.transform = `translateX(${-dir * 110}%) rotate(${-dir * 4}deg)`;
    paper.style.opacity = '0';
    setTimeout(() => {
      openLetter(cur + dir);
      paper.style.transition = 'none';
      paper.style.transform = `translateX(${dir * 60}%) rotate(${dir * 3}deg)`;
      void paper.offsetWidth;
      paper.style.transition = '';
      paper.style.transform = ''; paper.style.opacity = '';
    }, 190);
  }
  $('letter-prev').onclick = () => flip(-1);
  $('letter-next').onclick = () => flip(1);

  /* ───── 사진 라이트박스 ───── */
  const lb = $('lightbox'), card = $('lb-card'), lbImg = $('lb-img'), dots = $('lb-dots');
  let pi = -1, busy = false;
  dots.innerHTML = photos.map(() => '<i></i>').join('');
  function setPhoto(i) {
    pi = (i + photos.length) % photos.length;
    const p = photos[pi];
    const idx = pi;
    lbImg.alt = `사진 ${idx + 1}`;
    [...dots.children].forEach((d, k) => d.classList.toggle('on', k === idx));
    return new Promise((res) => {
      lbImg.onload = () => res();
      // 파일이 없으면 임시 카드로 대체 (대체 이미지가 로드되면 onload 가 이어서 호출됨)
      lbImg.onerror = () => { lbImg.onerror = null; lbImg.src = placeholderCanvas(idx, '', true).toDataURL(); };
      const abs = new URL(p.src, location.href).href;
      if (lbImg.complete && lbImg.naturalWidth && lbImg.currentSrc === abs) res();
      else lbImg.src = p.src;
    });
  }
  async function openPhoto(i, from) {
    await setPhoto(i);
    lb.classList.add('open'); lb.setAttribute('aria-hidden', 'false');
    document.body.classList.add('viewing');
    hooks.onViewing?.(true);
    // 벽에 붙어 있던 위치에서 튀어나오는 연출
    card.style.transition = 'none';
    card.style.opacity = '0';
    requestAnimationFrame(() => {
      const r = card.getBoundingClientRect();
      if (from) {
        const s = Math.max(0.1, from.w / r.width);
        const dx = from.x - (r.left + r.width / 2), dy = from.y - (r.top + r.height / 2);
        card.style.transform = `translate(${dx}px, ${dy}px) scale(${s}) rotate(${from.rot}deg)`;
      } else card.style.transform = 'scale(.9)';
      card.style.opacity = '1';
      void card.offsetWidth;
      card.style.transition = 'transform .5s cubic-bezier(.2,.9,.25,1.02), opacity .3s';
      card.style.transform = 'none';
    });
  }
  function closePhoto() {
    if (pi < 0) return;
    pi = -1;
    lb.classList.remove('open'); lb.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('viewing');
    card.style.transition = 'transform .3s, opacity .3s'; card.style.opacity = '0'; card.style.transform = 'scale(.94)';
    hooks.onViewing?.(false);
  }
  async function slide(dir) {
    if (busy || pi < 0) return;
    busy = true;
    card.style.transition = 'transform .22s ease-in, opacity .22s';
    card.style.transform = `translateX(${-dir * 60}px) rotate(${-dir * 3}deg)`; card.style.opacity = '0';
    await new Promise((r) => setTimeout(r, 200));
    await setPhoto(pi + dir);
    card.style.transition = 'none';
    card.style.transform = `translateX(${dir * 60}px) rotate(${dir * 3}deg)`;
    void card.offsetWidth;
    card.style.transition = 'transform .3s cubic-bezier(.2,.9,.25,1), opacity .3s';
    card.style.transform = 'none'; card.style.opacity = '1';
    setTimeout(() => { busy = false; }, 280);
  }
  $('lb-close').onclick = closePhoto;
  $('lb-prev').onclick = () => slide(-1);
  $('lb-next').onclick = () => slide(1);
  $('lb-stage').addEventListener('click', (e) => { if (e.target === $('lb-stage')) closePhoto(); });
  $('lightbox').querySelector('.lb-backdrop').onclick = closePhoto;
  {
    let x0 = null;
    const st = $('lb-stage');
    st.addEventListener('pointerdown', (e) => { x0 = e.clientX; });
    st.addEventListener('pointerup', (e) => {
      if (x0 === null) return;
      const dx = e.clientX - x0; x0 = null;
      if (Math.abs(dx) > 50) slide(dx < 0 ? 1 : -1);
    });
    st.addEventListener('pointercancel', () => { x0 = null; });
  }
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closePhoto(); closeLetter(); }
    else if (pi >= 0) { if (e.key === 'ArrowRight') slide(1); if (e.key === 'ArrowLeft') slide(-1); }
    else if (cur >= 0) { if (e.key === 'ArrowRight') flip(1); if (e.key === 'ArrowLeft') flip(-1); }
  });

  /* ───── 음악 ───── */
  const bgm = $('bgm');
  const btn = $('btn-music');
  let missing = false;
  let wantOn = store.get('bouquet.music', 'on') !== 'off';
  bgm.src = music.src;
  bgm.volume = 0;
  bgm.addEventListener('error', () => { missing = true; btn.classList.remove('on'); });
  function fadeTo(v, ms = 1200) {
    const from = bgm.volume, t0 = performance.now();
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / ms);
      bgm.volume = from + (v - from) * k;
      if (k < 1) requestAnimationFrame(step); else if (v === 0) bgm.pause();
    };
    step();
  }
  async function playMusic() {
    if (missing) return false;
    try { await bgm.play(); fadeTo(music.volume); btn.classList.add('on'); return true; }
    catch { return false; }
  }
  function armAudio() {
    if (!wantOn) return;
    const go = async () => {
      if (!wantOn || !bgm.paused) return cleanup();
      const ok = await playMusic();
      if (ok || missing) cleanup();
    };
    const cleanup = () => ['pointerup', 'touchend', 'keydown'].forEach((ev) => window.removeEventListener(ev, go));
    ['pointerup', 'touchend', 'keydown'].forEach((ev) => window.addEventListener(ev, go));
  }
  btn.onclick = async (e) => {
    e.stopPropagation();
    if (missing) { toast(`음악 파일이 없어요.\n${music.src} 를 추가해 주세요.`, 3600); return; }
    if (bgm.paused) { wantOn = true; store.set('bouquet.music', 'on'); await playMusic(); toast(`♪ ${music.title}`); }
    else { wantOn = false; store.set('bouquet.music', 'off'); btn.classList.remove('on'); fadeTo(0, 500); }
  };
  armAudio();

  return {
    toast, pop, confetti, rain, openLetter, closeLetter, openPhoto, closePhoto,
    isRead: (i) => readSet.has(i),
    get readCount() { return readSet.size; },
    get letterOpen() { return cur >= 0; },
    get photoOpen() { return pi >= 0; },
    get current() { return cur; },
  };
}
