"""계산서 PDF 글꼴 축소 — Noto Sans CJK (KR·TC·SC, OFL 1.1) 를 앱 소스에 쓰인 글자만 남겨 public/fonts/report-{kr,tc,sc}.otf 로 만든다.
계산서 글자는 모두 소스에서 온다(사전 문구·규범 주석·대만 縣市/鄉鎮 표·단면명·숫자) — 사용자 자유 입력 문자는 없다.
문구를 추가해 새 글자가 생기면 다시 실행: python scripts/subset-fonts.py <원본 OTF 폴더>
원본: https://github.com/notofonts/noto-cjk/tree/Sans2.004/Sans/OTF (Korean/NotoSansCJKkr, TraditionalChinese/NotoSansCJKtc, SimplifiedChinese/NotoSansCJKsc -Regular.otf)
scripts/verify-pdf.ts 가 언어별 계산서의 모든 글자가 글꼴에 있는지 확인한다."""
import pathlib, sys
from fontTools import subset

root = pathlib.Path(__file__).resolve().parent.parent
src_dir = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else sys.exit(__doc__)

chars = set(chr(c) for c in range(0x20, 0x7F)) | set(chr(c) for c in range(0xA0, 0x100))
for p in (root / 'src').rglob('*'):
    if p.suffix in ('.ts', '.tsx', '.json'):
        chars |= {ch for ch in p.read_text(encoding='utf8') if ord(ch) > 0x7E and (ch.isprintable() or ch.isspace())}
text = ''.join(sorted(chars))
print(f'{len(chars)} characters')

out = root / 'public' / 'fonts'
for tag in ('kr', 'tc', 'sc'):
    opts = subset.Options()
    opts.layout_features = ['*']  # 세로쓰기 외 기본 기능 유지 (kern·locl 등)
    opts.name_IDs = ['*']
    opts.name_languages = ['*']
    opts.notdef_outline = True
    opts.desubroutinize = False
    font = subset.load_font(str(src_dir / f'NotoSansCJK{tag}-Regular.otf'), opts)
    s = subset.Subsetter(opts)
    s.populate(text=text)
    s.subset(font)
    dst = out / f'report-{tag}.otf'
    subset.save_font(font, str(dst), opts)
    print(f'{dst.name}: {dst.stat().st_size / 1024:.0f} KB')
