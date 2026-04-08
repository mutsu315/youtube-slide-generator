#!/usr/bin/env python3
"""
batch_generate.py — 台本を章ごとにスライドジェネレーターへ自動投入し PDF を保存する

【使い方】
  python batch_generate.py 台本.txt
  python batch_generate.py 台本.txt --output-dir ./slides
  python batch_generate.py 台本.txt --url http://localhost:5177/youtube-slide-generator/

【章区切りの書き方】（いずれかをファイルに使ってください）
  # 見出し        ← Markdown 見出し
  第1章 タイトル  ← 日本語章タイトル
  ---             ← 3文字以上の水平線

【依存ライブラリ】
  pip install playwright
  playwright install chromium
"""

import re
import sys
import time
import argparse
from pathlib import Path

try:
    from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout
except ImportError:
    print("❌ playwright がインストールされていません。以下を実行してください：")
    print("   pip install playwright && playwright install chromium")
    sys.exit(1)

# ── デフォルト設定 ──────────────────────────────────────────
DEFAULT_URL = "http://localhost:5177/youtube-slide-generator/"
GENERATE_TIMEOUT_MS = 60_000   # 生成完了待ち最大60秒
DOWNLOAD_WAIT_MS   = 5_000    # DL開始待ち5秒

# ── 章区切りパターン ────────────────────────────────────────
SEPARATOR_RE = re.compile(
    r'^(?:'
    r'#{1,3}\s+(?P<md_title>.+)'           # ## 見出し
    r'|第[一二三四五六七八九十百千\d]+章[\s:：]*(?P<ch_title>.*)'  # 第N章
    r'|(?:CHAPTER|chapter|Chapter|STEP)\s*[\d]+[\s:：]*(?P<en_title>.*)'  # CHAPTER N
    r'|[■□▶]\s+(?P<symbol_title>.+)'       # ■ 見出し
    r'|[-=*]{3,}\s*'                        # --- 区切り線
    r')$',
    re.MULTILINE
)


def extract_title(line: str) -> str:
    m = SEPARATOR_RE.match(line.strip())
    if not m:
        return ''
    for group in ('md_title', 'ch_title', 'en_title', 'symbol_title'):
        if m.group(group):
            return m.group(group).strip()
    return ''


def split_chapters(text: str) -> list[tuple[str, str]]:
    """テキストを章ごとに分割。[(タイトル, 本文)] のリストを返す"""
    lines = text.splitlines()
    chapters = []
    current_title = None
    current_body = []

    for line in lines:
        if SEPARATOR_RE.match(line.strip()):
            if current_title is not None:
                body = '\n'.join(current_body).strip()
                if body:
                    chapters.append((current_title, body))
            current_title = extract_title(line) or f'チャプター {len(chapters) + 1}'
            current_body = []
        else:
            current_body.append(line)

    # 最後のチャプター
    if current_title is not None:
        body = '\n'.join(current_body).strip()
        if body:
            chapters.append((current_title, body))

    if not chapters:
        print("⚠️  章区切りが見つかりません。全体を1チャプターとして処理します。", file=sys.stderr)
        chapters = [("全体", text.strip())]

    return chapters


def to_step_format(title: str, body: str) -> str:
    """[---STEP---] 形式に変換"""
    return f"[---STEP---]\n{title}\n\n{body}"


def generate_slides_for_chapter(page, step_text: str, chapter_title: str, output_dir: Path, chapter_index: int) -> bool:
    """1章分をシステムに投入してPDFをダウンロード"""
    print(f"\n📝 [{chapter_index}] {chapter_title}")

    # テキストエリアをクリアして入力
    textarea = page.locator('textarea').first
    textarea.click()
    # Ctrl+A で全選択してから入力
    textarea.press('Control+a')
    textarea.fill(step_text)
    print(f"   ✏️  台本を投入しました ({len(step_text)} 文字)")

    # 生成ボタンをクリック
    generate_btn = page.locator('button:has-text("収録スライド生成")').first
    generate_btn.click()
    print("   ▶️  生成開始...")

    # 完了を待つ（ステータスメッセージで判断）
    try:
        page.wait_for_function(
            """() => {
                const allText = document.body.innerText;
                return allText.includes('収録スライド生成が完了しました') ||
                       allText.includes('生成済み');
            }""",
            timeout=GENERATE_TIMEOUT_MS
        )
        print("   ✅  生成完了")
    except PlaywrightTimeout:
        print("   ⚠️  タイムアウト — スライドが表示されているか確認してください")

    # PDF ダウンロードボタンをクリック
    safe_title = re.sub(r'[^\w\-_\u3040-\u9FFF\u30A0-\u30FF]', '_', chapter_title)[:40]
    output_filename = f"{chapter_index:02d}_{safe_title}.pdf"
    output_path = output_dir / output_filename

    with page.expect_download(timeout=DOWNLOAD_WAIT_MS * 3) as dl_info:
        # ファイル名フィールドを設定
        filename_input = page.locator('input[placeholder="ファイル名"]').first
        filename_input.fill(f"{chapter_index:02d}_{safe_title}")

        # PDF ボタンをクリック
        pdf_btn = page.locator('button:has-text("PDF")').first
        pdf_btn.click()
        print(f"   📥  PDFダウンロード中...")

    download = dl_info.value
    download.save_as(output_path)
    print(f"   💾  保存: {output_path}")
    return True


def main():
    parser = argparse.ArgumentParser(description='台本を章ごとにスライドジェネレーターへ自動投入')
    parser.add_argument('input', help='入力台本ファイル (.txt / .md)')
    parser.add_argument('--output-dir', '-o', default='./slide_output', help='PDF保存先ディレクトリ (デフォルト: ./slide_output)')
    parser.add_argument('--url', default=DEFAULT_URL, help=f'スライドジェネレーターのURL (デフォルト: {DEFAULT_URL})')
    parser.add_argument('--headless', action='store_true', help='ヘッドレスモード（ブラウザを非表示にする）')
    parser.add_argument('--chapters', '-c', help='処理する章番号（例: 1,3,5 または 2-4）')
    args = parser.parse_args()

    # ── ファイル読み込み ──
    input_path = Path(args.input)
    if not input_path.exists():
        print(f"❌ ファイルが見つかりません: {input_path}")
        sys.exit(1)

    text = input_path.read_text(encoding='utf-8')
    chapters = split_chapters(text)

    print(f"📚 {len(chapters)} 章を検出しました:")
    for i, (title, body) in enumerate(chapters, 1):
        word_count = len(body)
        print(f"   {i:2d}. {title} ({word_count} 文字)")

    # ── 処理する章を絞り込み ──
    target_indices = list(range(len(chapters)))  # デフォルト: 全チャプター
    if args.chapters:
        target_indices = []
        for part in args.chapters.split(','):
            part = part.strip()
            if '-' in part:
                start, end = part.split('-', 1)
                target_indices.extend(range(int(start) - 1, int(end)))
            else:
                target_indices.append(int(part) - 1)
        target_indices = [i for i in target_indices if 0 <= i < len(chapters)]
        print(f"\n▸ 処理対象: {[i+1 for i in target_indices]}")

    # ── 出力ディレクトリ作成 ──
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    print(f"\n💾 保存先: {output_dir.resolve()}")
    print(f"🌐 URL: {args.url}\n")

    input("Enterキーを押すとブラウザを起動して処理を開始します... ")

    # ── Playwright でブラウザ操作 ──
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=args.headless,
            args=['--disable-web-security', '--allow-file-access-from-files'],
            downloads_path=str(output_dir),
        )
        page = browser.new_page(
            viewport={'width': 1400, 'height': 900},
            accept_downloads=True,
        )

        # アプリを開く
        page.goto(args.url, wait_until='networkidle')
        print(f"✅  アプリを開きました: {args.url}\n")
        time.sleep(1)

        # 各チャプターを処理
        success_count = 0
        for idx in target_indices:
            title, body = chapters[idx]
            step_text = to_step_format(title, body)
            try:
                ok = generate_slides_for_chapter(page, step_text, title, output_dir, idx + 1)
                if ok:
                    success_count += 1
                time.sleep(2)  # 次のチャプターまで少し待機
            except Exception as e:
                print(f"   ❌  エラー: {e}")

        browser.close()

    print(f"\n🎉 完了！ {success_count}/{len(target_indices)} チャプターのPDFを保存しました")
    print(f"📁 保存先: {output_dir.resolve()}")


if __name__ == '__main__':
    main()
