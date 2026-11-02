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

  /* ───── 읽은 편지 ───── */
  const readSet = new Set(store.get('bouquet.read.v1', []));
  function updateProgress() {
    $('read-count').textContent = readSet.size;
    $('progress').hidden = readSet.size === 0;
    if (readSet.size > 0) $('hint').classList.add('gone');
  }
  updateProgress();

  /* ───── 편지 시트 ───── */
  let cur = -1;
  const sheet = $('letter');
  const paper = $('paper');
  function renderLetter(i, animate) {
    const l = letters[i];
    const f = flowerInfo(i);
    $('letter-chip').textContent = `${f.icon} ${f.ko}`;
    $('letter-body').textContent = l.text;
    $('letter-from').textContent = `— ${l.from}`;
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
  $('letter-prev').onclick = () => openLetter(cur - 1);
  $('letter-next').onclick = () => openLetter(cur + 1);
  // 아래로 쓸어내려 닫기
  {
    let y0 = null, dy = 0;
    paper.addEventListener('pointerdown', (e) => { if (e.target.closest('button')) return; y0 = e.clientY; dy = 0; });
    paper.addEventListener('pointermove', (e) => {
      if (y0 === null) return;
      dy = e.clientY - y0;
      if (dy > 0 && paper.scrollTop === 0) { paper.style.transition = 'none'; paper.style.transform = `translateY(${dy}px) rotate(-.6deg)`; }
    });
    const end = () => {
      if (y0 === null) return;
      paper.style.transition = ''; paper.style.transform = '';
      if (dy > 80 && paper.scrollTop === 0) closeLetter();
      y0 = null;
    };
    paper.addEventListener('pointerup', end); paper.addEventListener('pointercancel', end);
  }

  /* ───── 사진 라이트박스 ───── */
  const lb = $('lightbox'), card = $('lb-card'), lbImg = $('lb-img'), lbCap = $('lb-cap'), dots = $('lb-dots');
  let pi = -1, busy = false;
  dots.innerHTML = photos.map(() => '<i></i>').join('');
  function setPhoto(i) {
    pi = (i + photos.length) % photos.length;
    const p = photos[pi];
    const idx = pi;
    lbImg.alt = p.caption || '';
    lbCap.textContent = p.caption || '';
    [...dots.children].forEach((d, k) => d.classList.toggle('on', k === idx));
    return new Promise((res) => {
      lbImg.onload = () => res();
      // 파일이 없으면 임시 카드로 대체 (대체 이미지가 로드되면 onload 가 이어서 호출됨)
      lbImg.onerror = () => { lbImg.onerror = null; lbImg.src = placeholderCanvas(idx, p.caption, idx % 2 === 0).toDataURL(); };
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
    else if (cur >= 0) { if (e.key === 'ArrowRight') openLetter(cur + 1); if (e.key === 'ArrowLeft') openLetter(cur - 1); }
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
    toast, pop, openLetter, closeLetter, openPhoto, closePhoto,
    isRead: (i) => readSet.has(i),
    get readCount() { return readSet.size; },
    get letterOpen() { return cur >= 0; },
    get photoOpen() { return pi >= 0; },
    get current() { return cur; },
  };
}
