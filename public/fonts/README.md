# Report fonts

Subsets of Noto Sans CJK 2.004 Regular (SIL Open Font License 1.1, `OFL.txt`):

| File | Source | Used for |
|---|---|---|
| `report-kr.otf` | `Sans/OTF/Korean/NotoSansCJKkr-Regular.otf` | ko, en reports |
| `report-tc.otf` | `Sans/OTF/TraditionalChinese/NotoSansCJKtc-Regular.otf` | zh-TW reports |
| `report-sc.otf` | `Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf` | zh-CN reports |

Source: https://github.com/notofonts/noto-cjk/tree/Sans2.004/Sans/OTF

Each subset keeps only the characters that appear in the app source (dictionaries,
code notes, Taiwan site table, section names), about 0.8 MB instead of 16 MB.
The PDF export downloads only the font for the report language and embeds the
used glyphs. After adding text with new characters, regenerate:

    python scripts/subset-fonts.py <folder with the three source OTF files>

`scripts/verify-pdf.ts` fails if any report character is missing from its font.

## Screen and HTML fonts (v1.7.1)

`ui-fonts.css` is shared by the application and HTML exports:

| Language | UI font | Numeric values, section names, logs |
|---|---|---|
| ko | Self-hosted Pretendard Variable 1.3.9 → Noto Sans KR | IBM Plex Mono |
| en | IBM Plex Sans | IBM Plex Mono |
| zh-TW | Noto Sans TC | IBM Plex Mono |
| zh-CN | Installed Microsoft YaHei UI → Microsoft YaHei → Noto Sans SC | IBM Plex Mono |

Pretendard official dynamic subsets and license are in `pretendard/`.
IBM Plex and Noto web fonts retain the existing Google Fonts delivery.
Downloaded HTML links back to the app origin for Pretendard. Offline documents
should use the PDF export, whose regional Noto fonts are embedded.
