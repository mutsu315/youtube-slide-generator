#!/usr/bin/env python3
"""
台本 → [---STEP---] フォーマット変換スクリプト

使い方:
  python convert_script.py 台本.txt
  python convert_script.py 台本.txt -o output.txt
  python convert_script.py 台本.txt --preview   # プレビューのみ（保存しない）

対応している章区切りパターン:
  - # 見出し / ## 見出し / ### 見出し       (Markdown)
  - 第1章 / 第一章 / CHAPTER 1             (日本語・英語)
  - ■ タイトル / 【タイトル】                (装飾付き見出し)
  - --- / === / *** (3文字以上の区切り線)    (水平線)
"""

import re
import sys
import argparse
from pathlib import Path

# ── 章区切りパターン ─────────────────────────────────────
CHAPTER_PATTERNS = [
    # Markdown 見出し（H1〜H3）
    r'^#{1,3}\s+(.+)',
    # 第N章（漢数字・算用数字）
    r'^第[一二三四五六七八九十百千\d]+章[\s:：]*(.*)',
    # CHAPTER / STEP / Section
    r'^(?:CHAPTER|chapter|Chapter|STEP|Section)\s*[\d]+[\s:：]*(.*)',
    # ■ または 【】 で始まる見出し
    r'^[■□▶▷◆◇]\s+(.+)',
    r'^【(.+?)】',
    # 区切り線（--- / === / *** が3文字以上）
    r'^[-=*＝]{3,}\s*$',
]

SEPARATOR_RE = re.compile('|'.join(f'(?:{p})' for p in CHAPTER_PATTERNS), re.MULTILINE)


def extract_title(line: str) -> str:
    """区切り行からタイトルを抽出"""
    # Markdown 見出し
    m = re.match(r'^#{1,3}\s+(.+)', line)
    if m: return m.group(1).strip()

    # 第N章
    m = re.match(r'^第[一二三四五六七八九十百千\d]+章[\s:：]*(.*)', line)
    if m: return (m.group(1) or line).strip()

    # CHAPTER / STEP
    m = re.match(r'^(?:CHAPTER|chapter|Chapter|STEP|Section)\s*[\d]+[\s:：]*(.*)', line)
    if m: return (m.group(1) or line).strip()

    # ■ / 【】
    m = re.match(r'^[■□▶▷◆◇]\s+(.+)', line)
    if m: return m.group(1).strip()

    m = re.match(r'^【(.+?)】', line)
    if m: return m.group(1).strip()

    # 区切り線 → タイトルなし（空欄を返す、後で処理）
    return ''


def is_separator(line: str) -> bool:
    """この行が章区切りかどうか判定"""
    return bool(SEPARATOR_RE.match(line.strip()))


def convert(text: str) -> str:
    """台本テキストを [---STEP---] 形式に変換"""
    lines = text.splitlines()

    chapters = []  # [(title, body_lines)]
    current_title = None
    current_body = []
    found_any_separator = False

    for line in lines:
        stripped = line.strip()
        if is_separator(stripped):
            found_any_separator = True
            # 直前のチャプターを確定
            if current_title is not None:
                chapters.append((current_title, '\n'.join(current_body).strip()))
            current_title = extract_title(stripped) or f'チャプター {len(chapters) + 1}'
            current_body = []
        else:
            current_body.append(line)

    # 最後のチャプター
    if current_title is not None:
        chapters.append((current_title, '\n'.join(current_body).strip()))

    # 区切りが1つも見つからなかった場合 → 全体を1チャプターとして扱い警告
    if not found_any_separator:
        print('⚠️  章区切りが検出されませんでした。台本全体を1チャプターとして変換します。', file=sys.stderr)
        print('　 # 見出し / 第N章 / --- などで章を区切ってください。', file=sys.stderr)
        chapters = [('全体', text.strip())]

    # 出力組み立て
    parts = []
    for title, body in chapters:
        if not title and not body:
            continue
        parts.append(f'[---STEP---]\n{title}\n\n{body}')

    return '\n\n'.join(parts) + '\n'


def main():
    parser = argparse.ArgumentParser(description='台本を [---STEP---] 形式に変換')
    parser.add_argument('input', help='入力ファイル (.txt / .md)')
    parser.add_argument('-o', '--output', help='出力ファイル（省略時: 入力ファイル名_step.txt）')
    parser.add_argument('--preview', action='store_true', help='プレビューのみ（ファイル保存しない）')
    args = parser.parse_args()

    input_path = Path(args.input)
    if not input_path.exists():
        print(f'❌ ファイルが見つかりません: {input_path}', file=sys.stderr)
        sys.exit(1)

    text = input_path.read_text(encoding='utf-8')
    result = convert(text)

    chapter_count = result.count('[---STEP---]')
    print(f'✅ {chapter_count} チャプターを検出しました')

    if args.preview:
        print('\n' + '='*60)
        print(result)
        return

    output_path = Path(args.output) if args.output else input_path.with_stem(input_path.stem + '_step').with_suffix('.txt')
    output_path.write_text(result, encoding='utf-8')
    print(f'💾 保存しました: {output_path}')
    print(f'\n📋 スライドジェネレーター ( http://localhost:5177/youtube-slide-generator/ ) に貼り付けて使用してください')


if __name__ == '__main__':
    main()
