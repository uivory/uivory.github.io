// ─────────────────────────────────────────────────────────────
//  ✏️  여기만 고치면 됩니다 (편지 · 사진 · 음악 · 문구)
// ─────────────────────────────────────────────────────────────

export const site = {
  title: 'Memory of Bouquet',
  subtitle: '꽃을 눌러 편지를 읽고 남겨주세요',
};

// 배경음악 — assets/audio/ 폴더에 mp3 파일을 넣어주세요.
export const music = {
  src: 'assets/audio/oh-yeah.mp3',
  title: '슬리피 · Oh Yeah',
  volume: 0.55,
};

// ─── 편지 ─────────────────────────────────────────────────────
// 부케 속 꽃 17송이 = 편지 17칸.
//   거베라 4 → 장미 4 → 튤립 4 → 리시안셔스 3 → 작은 흰 꽃 2
// 편지는 Supabase(bouquet_letters 테이블)에 저장돼서, 링크를 받은 친구들이
// 빈 꽃을 눌러 직접 쓰고, 정한 비밀번호 4자리로 수정할 수 있어요.
// 아래 letters 는 미리 모아둔 편지(수정 불가)이자, 서버에 닿지 않을 때 보여줄 내용이에요.
export const LETTER_SLOTS = 17;

export const letterApi = {
  url: 'https://yvxankwsmeufifxwwsiy.supabase.co',
  key: 'sb_publishable_TZWITmVvYJSkfuP8l9CdNA_6Smo2Fp9', // 공개용 키 (브라우저에 노출돼도 되는 키)
};

export const letters = [
  { from: '상아', text: '어이 쌍둥이 사주 김민주! 넌 나랑 운명을 함께 하니까 너가 잘 살아야 나도 잘 산다! 그러니까 앞으로 더더 행복해질 일만 남은거야 알겠지? 너무 축하하고 잘 살아라!\n부케 고맙다💐' },
  { from: '이서', text: '민주야 결혼 너무 축하해!!\n함께하는 하루가 행복하길 바랄게~\n너의 행복은 나의 기쁨이야' },
  { from: '지은', text: '민주의 결혼을 추카추카~~~\n항상 행복하고 즐거운 일만 가득하길 바랄게!!!!\n힘들거나 지치는 일이 있어도!! 걱정이나 푸념 들어줄 수 있으니 언제든 점심 같이 먹으면서 이야기 하자!!!\n앞으로도 꽃 길만 가득하길~~💖💖' },
  { from: '지현', text: '민주 결혼 왕왕 축하해!! 꽃길만 걸어잇✨🌸' },
  { from: '아름', text: '민주야! 결혼 너무너무 축하해! 결혼식날 너무 행복해 보이더라~ 그 행복한 마음 10,20,30년 평생 남편분이랑 느꼈으면 좋겠어!' },
  { from: '유연', text: '민주야~~ 결혼축하해! 행복한 결혼생활보내구 그만큼 초원옥도 번창하길🩷' },
];

// ─── 결혼 사진 ────────────────────────────────────────────────
// assets/photos/ 폴더에 사진을 넣고 파일명을 맞춰주세요.
// (파일이 없으면 임시 사진 카드가 대신 표시됩니다.)
// 벽 가운데에 poster 를 붙이고, 그 주변으로 사진 12장이 마스킹테이프로 붙습니다.
// (13장째부터는 사진을 넘길 때 이어서 나옵니다.)
export const poster = { src: 'assets/photos/poster.jpg' };

export const photos = [
  { src: 'assets/photos/01.jpg' },
  { src: 'assets/photos/02.jpg' },
  { src: 'assets/photos/03.jpg' },
  { src: 'assets/photos/04.jpg' },
  { src: 'assets/photos/05.jpg' },
  { src: 'assets/photos/06.jpg' },
  { src: 'assets/photos/07.jpg' },
  { src: 'assets/photos/08.jpg' },
  { src: 'assets/photos/09.jpg' },
  { src: 'assets/photos/10.jpg' },
  { src: 'assets/photos/11.jpg' },
  { src: 'assets/photos/12.jpg' },
];
