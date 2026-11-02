import { letters as presetLetters, letterApi, LETTER_SLOTS, LETTER_MAX } from '../data/content.js?v=20261102e';

/* ────────────────────────────────────────────────────────────
   편지 저장소 (Supabase)
   - 읽기: bouquet_letters 테이블 (누구나)
   - 쓰기/수정: write_bouquet_letter() 함수
     (초기 비밀번호 0000. 새로 쓸 때 정할 수 있고, 수정할 때 새 비밀번호로 바꿀 수 있음)
   서버에 닿지 않으면 content.js 의 편지로 대신 보여줍니다.
   ──────────────────────────────────────────────────────────── */

export { LETTER_MAX };
const blank = () => ({ from: '', text: '', locked: false, empty: true });

/** @type {{from: string, text: string, locked: boolean, empty: boolean}[]} */
export const letters = Array.from({ length: LETTER_SLOTS }, (_, i) => {
  const p = presetLetters[i];
  return p && p.text
    ? { from: p.from, text: p.text, locked: false, empty: false }
    : blank();
});

/** 빈 칸이 없으면 맨 뒤에 빈 칸 하나를 붙임 (최대 LETTER_MAX). 붙였거나 원래 있던 첫 빈 칸 번호, 꽉 찼으면 -1 */
export function ensureEmptySlot() {
  const i = letters.findIndex((l) => l.empty);
  if (i >= 0) return i;
  if (letters.length >= LETTER_MAX) return -1;
  letters.push(blank());
  return letters.length - 1;
}

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
    // 서버에 있는 칸 수만큼 늘림 (17칸보다 많아질 수 있음). 화면에서 임시로 붙인 빈 칸은 유지
    const maxSlot = rows.reduce((m, r) => Math.max(m, r.slot), LETTER_SLOTS - 1);
    while (letters.length <= maxSlot) letters.push(blank());
    rows.forEach((r) => {
      if (r.slot < 0 || r.slot >= LETTER_MAX) return;
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
  taken: '방금 다른 친구가 이 칸에 편지를 썼어요. 다음 빈 칸에 써 주세요.',
  full: `편지함이 가득 찼어요 (최대 ${LETTER_MAX}통).`,
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

/**
 * 새 편지 쓰기. slot 이 빈 칸이면 그 칸에, 서버에 아직 없는 새 칸이면 새로 만들어 씀.
 * 그 사이 다른 친구가 같은 칸을 차지했으면 'taken' 에러. 성공하면 실제로 저장된 칸 번호를 돌려줌.
 */
export async function addLetter(slot, from, text, pin) {
  let res;
  try {
    res = await fetch(`${letterApi.url}/rest/v1/rpc/add_bouquet_letter`, {
      method: 'POST', headers: headers(),
      body: JSON.stringify({ p_author: from, p_body: text, p_pin: pin || null, p_slot: slot }),
    });
  } catch {
    throw new Error('인터넷 연결을 확인해 주세요.');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const code = data?.message || '';
    if (code === 'taken' || code === 'bad_slot') refreshLetters(true);
    throw new Error(ERR[code === 'bad_slot' ? 'taken' : code] || '저장하지 못했어요. 잠시 후 다시 시도해 주세요.');
  }
  const s = Number(data);
  while (letters.length <= s) letters.push(blank());
  letters[s] = { from: from.trim(), text: text.trim(), locked: false, empty: false };
  listeners.forEach((fn) => fn());
  refreshLetters(true);
  return s;
}
