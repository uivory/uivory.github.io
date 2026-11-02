import { letters as presetLetters, letterApi, LETTER_SLOTS } from '../data/content.js?v=20261102c';

/* ────────────────────────────────────────────────────────────
   편지 저장소 (Supabase)
   - 읽기: bouquet_letters 테이블 (누구나)
   - 쓰기/수정: write_bouquet_letter() 함수
     (초기 비밀번호 0000. 새로 쓸 때 정할 수 있고, 수정할 때 새 비밀번호로 바꿀 수 있음)
   서버에 닿지 않으면 content.js 의 편지로 대신 보여줍니다.
   ──────────────────────────────────────────────────────────── */

/** @type {{from: string, text: string, locked: boolean, empty: boolean}[]} */
export const letters = Array.from({ length: LETTER_SLOTS }, (_, i) => {
  const p = presetLetters[i];
  return p && p.text
    ? { from: p.from, text: p.text, locked: false, empty: false }
    : { from: '', text: '', locked: false, empty: true };
});

const listeners = new Set();
export const onLettersChange = (fn) => listeners.add(fn);
let online = false;
export const isOnline = () => online;

const headers = () => ({ apikey: letterApi.key, 'Content-Type': 'application/json' });

let lastFetch = 0;
/** 서버에서 최신 편지 받아오기 (force 가 아니면 10초 안에 다시 부르지 않음) */
export async function refreshLetters(force = false) {
  if (!letterApi?.url) return false;
  const now = Date.now();
  if (!force && now - lastFetch < 10000) return online;
  lastFetch = now;
  try {
    const res = await fetch(`${letterApi.url}/rest/v1/bouquet_letters?select=slot,author,body,locked&order=slot`, { headers: headers() });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = await res.json();
    rows.forEach((r) => {
      if (r.slot < 0 || r.slot >= letters.length) return;
      const empty = !r.body;
      letters[r.slot] = { from: r.author || '', text: r.body || '', locked: !!r.locked, empty };
    });
    online = true;
    listeners.forEach((fn) => fn());
    return true;
  } catch (e) {
    console.warn('[letters] 서버에서 편지를 불러오지 못했어요:', e.message);
    online = false;
    return false;
  }
}

const ERR = {
  bad_slot: '편지 자리를 찾지 못했어요.',
  bad_author: '이름을 1~20자로 적어주세요.',
  bad_body: '편지를 1~1000자로 적어주세요.',
  bad_pin: '비밀번호는 숫자 4자리예요.',
  bad_new_pin: '새 비밀번호는 숫자 4자리예요.',
  locked: '이 편지는 수정할 수 없어요.',
  too_many_tries: '비밀번호를 여러 번 틀려서 10분 동안 잠겼어요.',
  wrong_pin: '비밀번호가 맞지 않아요.',
};

/**
 * 편지 쓰기/수정 (newPin 을 주면 비밀번호도 바꿈). 성공하면 'created' | 'updated' 를 돌려주고, 실패하면 사용자에게 보여줄 문장으로 에러를 던짐.
 */
export async function writeLetter(slot, from, text, pin, newPin = '') {
  let res;
  try {
    res = await fetch(`${letterApi.url}/rest/v1/rpc/write_bouquet_letter`, {
      method: 'POST', headers: headers(),
      body: JSON.stringify({ p_slot: slot, p_author: from, p_body: text, p_pin: pin, p_new_pin: newPin || null }),
    });
  } catch {
    throw new Error('인터넷 연결을 확인해 주세요.');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const code = data?.message || '';
    throw new Error(ERR[code] || '저장하지 못했어요. 잠시 후 다시 시도해 주세요.');
  }
  if (data === 'wrong_pin') throw new Error(ERR.wrong_pin);
  letters[slot] = { from: from.trim(), text: text.trim(), locked: false, empty: false };
  listeners.forEach((fn) => fn());
  refreshLetters(true);
  return data;
}
