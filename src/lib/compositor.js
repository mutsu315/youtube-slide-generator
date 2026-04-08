/**
 * YouTube収録スライド Canvas合成エンジン v3
 *
 * 責任範囲: テキストオーバーレイのみ
 * - 背景: 透明（別システムの写真と合成する前提）
 * - テキストボックス: 白(不透明度70%)・中央配置・黒文字
 * - フォント: Noto Sans JP Bold
 *
 * ドキュメント参照:
 * https://docs.google.com/document/d/1VHfJvGRxGcK4jMlavApY6bLrkx6Co5JwB5vHfU9cGQ0
 */

import { loadDefaultJapaneseParser } from 'budoux'
const parser = loadDefaultJapaneseParser()

const SLIDE_WIDTH = 1920
const SLIDE_HEIGHT = 1080

// ── ユーティリティ ──────────────────────────────────────

async function ensureFont(fontFamily, weight) {
  try {
    await document.fonts.load(`${weight} 48px "${fontFamily}"`)
  } catch { /* フォールバック */ }
}

/**
 * BudouXを使った日本語文節折り返し
 * 単語の途中では折り返さない
 */
function wrapText(ctx, text, maxWidth) {
  const lines = []
  const paragraphs = text.split('\n')

  for (const paragraph of paragraphs) {
    if (paragraph.trim() === '') { lines.push(''); continue }

    const chunks = parser.parse(paragraph)
    let currentLine = ''

    for (const chunk of chunks) {
      const testLine = currentLine + chunk
      if (ctx.measureText(testLine).width > maxWidth && currentLine !== '') {
        lines.push(currentLine)
        // 1チャンクが最大幅を超える場合のみ文字単位で処理（まれなケース）
        if (ctx.measureText(chunk).width > maxWidth) {
          let sub = ''
          for (const char of chunk) {
            if (ctx.measureText(sub + char).width > maxWidth && sub !== '') {
              lines.push(sub)
              sub = char
            } else {
              sub += char
            }
          }
          currentLine = sub
        } else {
          currentLine = chunk
        }
      } else {
        currentLine = testLine
      }
    }
    if (currentLine) lines.push(currentLine)
  }

  return lines
}

// ── チャプター扉スライド ──────────────────────────────────

/**
 * チャプター扉: 透明背景 + 白ボックス（大タイトル）
 * Canvasの背景を透明にし、写真背景と重ねる前提
 */
export async function compositeNavigationSlide(steps, currentIndex, options = {}) {
  const { fontFamily = 'Noto Sans JP' } = options

  await ensureFont(fontFamily, '700')
  await ensureFont(fontFamily, '400')

  const canvas = document.createElement('canvas')
  canvas.width = SLIDE_WIDTH
  canvas.height = SLIDE_HEIGHT
  const ctx = canvas.getContext('2d', { alpha: true })

  // 透明背景（clearRect で透明にする）
  ctx.clearRect(0, 0, SLIDE_WIDTH, SLIDE_HEIGHT)

  const currentStep = steps[currentIndex]

  // ── メインタイトルボックス ──
  // 白い長方形・透明度70・角丸なし・影なし (Google Doc仕様準拠)
  const boxPadX = 60  // 左右パディング
  const boxPadY = 40  // 上下パディング
  const boxW = SLIDE_WIDTH - 240
  const boxX = (SLIDE_WIDTH - boxW) / 2

  // タイトルのフォント設定してテキスト幅を計算
  ctx.font = `700 72px "${fontFamily}"`
  const titleLines = wrapText(ctx, currentStep.title, boxW - boxPadX * 2)

  // CHAPTER ラベル
  const labelFontSize = 28
  const lineH = 72 * 1.5
  const titleBlockH = titleLines.length * lineH
  const labelH = labelFontSize * 2
  const totalContentH = labelH + 24 + titleBlockH
  const boxH = totalContentH + boxPadY * 2
  const boxY = (SLIDE_HEIGHT - boxH) / 2

  // 白ボックス描画
  ctx.fillStyle = 'rgba(255, 255, 255, 0.70)'
  ctx.fillRect(boxX, boxY, boxW, boxH)

  // CHAPTER ラベル
  ctx.font = `700 ${labelFontSize}px "${fontFamily}"`
  ctx.fillStyle = '#CC0000'  // 数字部分は赤文字（Google Doc仕様）
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(
    `CHAPTER ${currentIndex + 1} / ${steps.length}`,
    boxX + boxPadX,
    boxY + boxPadY + labelFontSize
  )

  // タイトルテキスト
  ctx.font = `700 72px "${fontFamily}"`
  ctx.fillStyle = '#000000'
  const titleStartY = boxY + boxPadY + labelH + 24 + 72
  titleLines.slice(0, 3).forEach((line, li) => {
    ctx.fillText(line, boxX + boxPadX, titleStartY + li * lineH)
  })

  // 前後チャプター（小さく下部に）
  const prevChapter = steps[currentIndex - 1]
  const nextChapter = steps[currentIndex + 1]
  const subY = boxY + boxH + 20

  if (prevChapter || nextChapter) {
    const subBoxH = 44
    const subBoxW = boxW
    ctx.fillStyle = 'rgba(255, 255, 255, 0.50)'
    ctx.fillRect(boxX, subY, subBoxW, subBoxH)

    ctx.font = `400 22px "${fontFamily}"`
    ctx.fillStyle = '#333333'
    ctx.textAlign = 'left'

    let subText = ''
    if (prevChapter) subText += `← ${prevChapter.title}`
    if (prevChapter && nextChapter) subText += '　　'
    if (nextChapter) subText += `${nextChapter.title} →`
    ctx.fillText(subText, boxX + 24, subY + 28)
  }

  const url = canvas.toDataURL('image/png')
  return { url, pageText: `チャプター: ${currentStep?.title}` }
}

// ── テロップスライド ──────────────────────────────────────

/**
 * テロップスライド: 透明背景 + 白ボックス + 台本テキスト
 *
 * Google Doc仕様:
 * - 白の長方形ボックス（角丸なし・影なし）透明度70
 * - 画面中央に配置
 * - テキストは左寄せ
 * - 余白: 上下20px・左右30px
 * - フォント: Noto Sans JP Bold・黒文字 #000000
 * - 1スライド = 1メッセージ
 */
export async function compositeTelopSlide(stepTitle, telop, kanpeText, options = {}) {
  const {
    fontFamily = 'Noto Sans JP',
    kanpeFontSize = 20,
  } = options

  await ensureFont(fontFamily, '700')
  await ensureFont(fontFamily, '400')

  const canvas = document.createElement('canvas')
  canvas.width = SLIDE_WIDTH
  canvas.height = SLIDE_HEIGHT
  const ctx = canvas.getContext('2d', { alpha: true })

  // 透明背景
  ctx.clearRect(0, 0, SLIDE_WIDTH, SLIDE_HEIGHT)

  // ── テキストボックスのサイズ計算 ──
  const boxPadX = 30   // 左右パディング (Google Doc仕様: 左右30px)
  const boxPadY = 20   // 上下パディング (Google Doc仕様: 上下20px)
  const boxMaxW = SLIDE_WIDTH - 240  // 両側に120pxのマージン

  // フォントサイズ自動調整（文字数に応じて）
  const telopLen = telop.length
  let telopFontSize = 64
  if (telopLen > 30) telopFontSize = 54
  if (telopLen > 42) telopFontSize = 44
  if (telopLen > 55) telopFontSize = 36

  ctx.font = `700 ${telopFontSize}px "${fontFamily}"`
  const telopLines = wrapText(ctx, telop, boxMaxW - boxPadX * 2)

  const lineH = telopFontSize * 1.6
  const telopBlockH = telopLines.length * lineH

  // チャプタータイトル行
  const chapterFontSize = 22
  const chapterH = chapterFontSize * 1.8

  const totalContentH = chapterH + 8 + telopBlockH
  const boxH = totalContentH + boxPadY * 2
  const boxW = boxMaxW
  const boxX = (SLIDE_WIDTH - boxW) / 2
  const boxY = (SLIDE_HEIGHT - boxH) / 2  // 垂直中央

  // 白のテキストボックス描画（角丸なし・影なし・透明度70）
  ctx.fillStyle = 'rgba(255, 255, 255, 0.70)'
  ctx.fillRect(boxX, boxY, boxW, boxH)

  // チャプタータイトル（小さく・グレー）
  ctx.font = `400 ${chapterFontSize}px "${fontFamily}"`
  ctx.fillStyle = '#666666'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(stepTitle, boxX + boxPadX, boxY + boxPadY + chapterFontSize)

  // テロップテキスト（黒・Bold・左寄せ）
  ctx.font = `700 ${telopFontSize}px "${fontFamily}"`
  ctx.fillStyle = '#000000'
  const telopStartY = boxY + boxPadY + chapterH + 8 + telopFontSize
  telopLines.forEach((line, li) => {
    ctx.fillText(line, boxX + boxPadX, telopStartY + li * lineH)
  })

  // ── カンペエリア（スライド最下部・暗い帯）──
  if (kanpeText && kanpeText.trim()) {
    const kanpeH = 120
    const kanpeY = SLIDE_HEIGHT - kanpeH

    // 半透明ダーク背景（カンペ用・視聴者から見えにくく）
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)'
    ctx.fillRect(0, kanpeY, SLIDE_WIDTH, kanpeH)

    // SCRIPT ラベル
    ctx.font = `700 12px "${fontFamily}"`
    ctx.fillStyle = 'rgba(251, 191, 36, 0.6)'
    ctx.textAlign = 'left'
    ctx.fillText('SCRIPT', 40, kanpeY + 18)

    // カンペテキスト
    ctx.font = `400 ${kanpeFontSize}px "${fontFamily}"`
    ctx.fillStyle = 'rgba(255, 255, 255, 0.80)'
    const kanpeLines = wrapText(ctx, kanpeText.trim(), SLIDE_WIDTH - 80)
    const kanpeLineH = kanpeFontSize * 1.5
    const maxLines = Math.floor((kanpeH - 28) / kanpeLineH)
    for (let i = 0; i < Math.min(kanpeLines.length, maxLines); i++) {
      ctx.fillText(kanpeLines[i], 40, kanpeY + 26 + i * kanpeLineH)
    }
  }

  const url = canvas.toDataURL('image/png')
  return { url, pageText: telop }
}

/**
 * 1ステップ分のテロップスライド群を順番に生成
 */
export async function compositeTelopProgressiveSet(stepTitle, telops, kanpeChunks, options = {}) {
  const results = []
  for (let i = 0; i < telops.length; i++) {
    const kanpe = kanpeChunks[i] || ''
    const slide = await compositeTelopSlide(stepTitle, telops[i], kanpe, options)
    results.push(slide)
  }
  return results
}

/**
 * 本文テキストをN分割してカンペに使う
 */
export function splitKanpeText(text, count) {
  if (!text || count <= 0) return Array(count).fill('')
  const paragraphs = text.split(/\n+/).filter(p => p.trim())
  if (paragraphs.length === 0) return Array(count).fill('')

  if (paragraphs.length <= count) {
    const result = paragraphs.map(p => p.trim())
    while (result.length < count) result.push('')
    return result
  }

  const result = []
  const perChunk = Math.ceil(paragraphs.length / count)
  for (let i = 0; i < count; i++) {
    const start = i * perChunk
    result.push(
      paragraphs.slice(start, Math.min(start + perChunk, paragraphs.length)).join(' ').trim()
    )
  }
  return result
}

// 後方互換エイリアス
export const compositeBulletSlide = compositeTelopSlide
export async function compositeBulletProgressiveSet(stepTitle, bullets, kanpeChunks, options = {}) {
  return compositeTelopProgressiveSet(stepTitle, bullets, kanpeChunks, options)
}
