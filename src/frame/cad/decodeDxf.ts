// 출처: StruXureAI src/utils/decodeDxf.ts (2026-10-21 복사, 내용 그대로). 고칠 때 StruXureAI 에도 반영할지 기록한다.
// DXF 바이트 → 문자열. 중국/대만 실도면은 CJK가 UTF-8이 아니라 코드페이지(GBK/Big5)로
// 저장된 경우가 많아 무조건 UTF-8로 디코딩하면 레이어명(柱/墙/梁)이 깨진다(mojibake) →
// classifyLayer가 한자 키워드를 못 잡음. 아래 전략으로 자동 판별:
//   1) UTF-8을 fatal 모드로 시도 → 유효하면 그대로 사용(이미 UTF-8인 파일 보존).
//   2) 실패하면 DXF 헤더 $DWGCODEPAGE를 읽어 해당 코드페이지로 디코딩(기본 GBK).

// AutoCAD $DWGCODEPAGE(ANSI_xxx) → TextDecoder 라벨.
const CODEPAGE_LABEL: Record<string, string> = {
  ANSI_936: 'gbk',          // 중국 간체(GB2312/GBK)
  ANSI_950: 'big5',         // 대만/홍콩 번체
  ANSI_949: 'euc-kr',       // 한국
  ANSI_932: 'shift_jis',    // 일본
  ANSI_1252: 'windows-1252',// 서유럽
  ANSI_1251: 'windows-1251',// 키릴
};

// 헤더에서 $DWGCODEPAGE 값을 뽑는다(ASCII 영역이라 latin1로 안전하게 peek).
const readCodepage = (bytes: Uint8Array): string | undefined => {
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, Math.min(bytes.length, 4096)));
  const m = /\$DWGCODEPAGE\s*[\r\n]+\s*3\s*[\r\n]+\s*([A-Za-z0-9_]+)/.exec(head);
  return m?.[1]?.toUpperCase();
};

const REPLACEMENT = 0xfffd;
const countReplacement = (s: string): number => {
  let n = 0;
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === REPLACEMENT) n++;
  return n;
};

// UTF-8 여부 판별: 고바이트(≥0x80) 중 UTF-8 무효(U+FFFD) 비율.
//   · 정상 UTF-8 → 고바이트가 유효 멀티바이트 시퀀스 → 비율≈0
//   · GBK/Big5 → CJK 2바이트가 UTF-8로 무효 → 비율 0.3~0.5
// 전체 길이 대비 비율은 ASCII 좌표 데이터에 희석돼 불안정하므로, '고바이트 대비'로 본다.
// ($DWGCODEPAGE는 libredwg가 소스값을 그대로 복사해 UTF-8/GBK 구분에 쓸 수 없음 — 라벨 매핑에만 사용)
const looksUtf8 = (bytes: Uint8Array, utf8: string): boolean => {
  let high = 0;
  for (let i = 0; i < bytes.length; i++) if (bytes[i] >= 0x80) high++;
  if (high === 0) return true; // 순수 ASCII
  return countReplacement(utf8) / high < 0.15;
};

export const decodeDxfBytes = (bytes: Uint8Array): string => {
  const utf8 = new TextDecoder('utf-8').decode(bytes); // 관대(무효 바이트→U+FFFD)
  if (looksUtf8(bytes, utf8)) return utf8;

  // 코드페이지 인코딩 → $DWGCODEPAGE 라벨로 디코딩(기본 GBK, 이 시장 최빈).
  const cp = readCodepage(bytes);
  const label = (cp && CODEPAGE_LABEL[cp]) || 'gbk';
  try {
    const alt = new TextDecoder(label).decode(bytes);
    return countReplacement(alt) <= countReplacement(utf8) ? alt : utf8;
  } catch {
    return utf8; // 라벨 미지원 브라우저 등 → 관대 UTF-8
  }
};
