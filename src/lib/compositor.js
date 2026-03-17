/**
 * YouTube収録スライド Canvas合成エンジン
 *
 * 1. ナビゲーションスライド: 全ステップ一覧＋現在ステップのハイライト
 * 2. 箇条書きプログレッシブスライド: 要素が1つずつ追加される連番画像
 * 3. カンペ（台本）: スライド下部に話者用テキストを表示
 *
 * テキスト描画はすべて BudouX による文節改行 + Google Fonts を適用
 */

const SLIDE_WIDTH = 1920
const SLIDE_HEIGHT = 1080

import { loadDefaultJapaneseParser } from 'budoux'
const parser = loadDefaultJapaneseParser()

// ── ユーティリティ ──────────────────────────────────────

async function ensureFont(fontFamily, weight) {
  try {
    await document.fonts.load(`${weight} 48px "${fontFamily}"`)
  } catch { /* フォールバック */ }
}

/** テキストを指定幅で折り返し（BudouX利用） */
function wrapText(ctx, text, maxWidth) {
  const lines = []
  const paragraphs = text.split('\n')

  for (const paragraph of paragraphs) {
    if (paragraph.trim() === '') {
      lines.push('')
      continue
    }
    const chunks = parser.parse(paragraph)
    let currentLine = ''
    for (const chunk of chunks) {
      const testLine = currentLine + chunk
      const testWidth = ctx.measureText(testLine).width
      if (testWidth > maxWidth && currentLine !== '') {
        lines.push(currentLine)
        let subCurrent = ''
        for (const char of chunk) {
          if (ctx.measureText(subCurrent + char).width > maxWidth && subCurrent !== '') {
            lines.push(subCurrent)
            subCurrent = char
          } else {
            subCurrent += char
          }
        }
        currentLine = subCurrent
      } else {
        currentLine = testLine
      }
    }
    if (currentLine) lines.push(currentLine)
  }
  return lines
}

/** 角丸矩形パスを描画 */
function roundRect(ctx, x, y, w, h, r) {
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

function fillRoundRect(ctx, x, y, w, h, r, fillStyle) {
  ctx.fillStyle = fillStyle
  ctx.beginPath()
  roundRect(ctx, x, y, w, h, r)
  ctx.fill()
}

function strokeRoundRect(ctx, x, y, w, h, r, strokeStyle, lineWidth = 1) {
  ctx.strokeStyle = strokeStyle
  ctx.lineWidth = lineWidth
  ctx.beginPath()
  roundRect(ctx, x, y, w, h, r)
  ctx.stroke()
}

/** 暗いグラデーション背景 */
function drawDarkGradientBg(ctx) {
  const grad = ctx.createLinearGradient(0, 0, SLIDE_WIDTH, SLIDE_HEIGHT)
  grad.addColorStop(0, '#0f0c29')
  grad.addColorStop(0.5, '#1a1744')
  grad.addColorStop(1, '#24243e')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, SLIDE_WIDTH, SLIDE_HEIGHT)
}

// ── ナビゲーションスライド ──────────────────────────────

/**
 * 全ステップ一覧を表示し、currentIndex のステップをハイライト
 * @param {Array} steps - [{ title }]
 * @param {number} currentIndex
 * @param {object} options - { fontFamily, fontWeight }
 * @returns {{ url: string, pageText: string }}
 */
export async function compositeNavigationSlide(steps, currentIndex, options = {}) {
  const {
    fontFamily = 'Noto Sans JP',
    fontWeight = '700',
  } = options

  await ensureFont(fontFamily, fontWeight)
  await ensureFont(fontFamily, '400')
  await ensureFont(fontFamily, '500')

  const canvas = document.createElement('canvas')
  canvas.width = SLIDE_WIDTH
  canvas.height = SLIDE_HEIGHT
  const ctx = canvas.getContext('2d')

  drawDarkGradientBg(ctx)

  // 装飾：薄い円
  ctx.fillStyle = 'rgba(239, 68, 68, 0.03)'
  ctx.beginPath()
  ctx.arc(SLIDE_WIDTH - 300, 150, 350, 0, Math.PI * 2)
  ctx.fill()

  // ガラスパネル
  const stepH = 72
  const panelPadTop = 100
  const panelPadBottom = 50
  const panelH = Math.min(900, panelPadTop + panelPadBottom + steps.length * stepH)
  const panelW = 1200
  const panelX = (SLIDE_WIDTH - panelW) / 2
  const panelY = (SLIDE_HEIGHT - panelH) / 2

  fillRoundRect(ctx, panelX, panelY, panelW, panelH, 24, 'rgba(255, 255, 255, 0.05)')
  strokeRoundRect(ctx, panelX, panelY, panelW, panelH, 24, 'rgba(255, 255, 255, 0.1)')

  // タイトル
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.font = `${fontWeight} 44px "${fontFamily}"`
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
  ctx.fillText('全体の流れ', SLIDE_WIDTH / 2, panelY + 65)

  // 区切り線
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(panelX + 60, panelY + 88)
  ctx.lineTo(panelX + panelW - 60, panelY + 88)
  ctx.stroke()

  // ステップ一覧
  const listStartY = panelY + panelPadTop + 10
  ctx.textAlign = 'left'

  for (let i = 0; i < steps.length; i++) {
    const y = listStartY + i * stepH
    const isCurrent = i === currentIndex

    if (isCurrent) {
      // ハイライト背景
      fillRoundRect(ctx, panelX + 40, y, panelW - 80, stepH - 10, 14, 'rgba(239, 68, 68, 0.15)')
      // 左アクセントバー
      fillRoundRect(ctx, panelX + 40, y, 5, stepH - 10, 3, '#EF4444')

      // 番号サークル
      ctx.fillStyle = '#EF4444'
      ctx.beginPath()
      ctx.arc(panelX + 90, y + (stepH - 10) / 2, 20, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#FFFFFF'
      ctx.font = `700 22px "${fontFamily}"`
      ctx.textAlign = 'center'
      ctx.fillText(String(i + 1), panelX + 90, y + (stepH - 10) / 2 + 8)

      // テキスト
      ctx.textAlign = 'left'
      ctx.font = `700 30px "${fontFamily}"`
      ctx.fillStyle = '#FFFFFF'
      const titleLines = wrapText(ctx, steps[i].title, panelW - 220)
      ctx.fillText(titleLines[0] || steps[i].title, panelX + 125, y + (stepH - 10) / 2 + 10)
    } else {
      // 番号サークル（アウトライン）
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(panelX + 90, y + (stepH - 10) / 2, 20, 0, Math.PI * 2)
      ctx.stroke()
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)'
      ctx.font = `500 22px "${fontFamily}"`
      ctx.textAlign = 'center'
      ctx.fillText(String(i + 1), panelX + 90, y + (stepH - 10) / 2 + 8)

      // テキスト
      ctx.textAlign = 'left'
      ctx.font = `400 26px "${fontFamily}"`
      ctx.fillStyle = 'rgba(255, 255, 255, 0.30)'
      const titleLines = wrapText(ctx, steps[i].title, panelW - 220)
      ctx.fillText(titleLines[0] || steps[i].title, panelX + 125, y + (stepH - 10) / 2 + 9)
    }
  }

  // 下部: 現在のステップ名
  ctx.textAlign = 'center'
  ctx.font = `500 20px "${fontFamily}"`
  ctx.fillStyle = 'rgba(239, 68, 68, 0.6)'
  ctx.fillText(`▶ ${steps[currentIndex]?.title || ''}`, SLIDE_WIDTH / 2, SLIDE_HEIGHT - 40)

  const url = canvas.toDataURL('image/png')
  return { url, pageText: `ナビゲーション: ${steps[currentIndex]?.title}` }
}

// ── 箇条書きプログレッシブスライド ──────────────────────

/**
 * 1枚の箇条書きスライドを生成
 * visibleCount 個目までの箇条書きが表示された状態
 */
export async function compositeBulletSlide(stepTitle, bullets, visibleCount, kanpeText, options = {}) {
  const {
    fontFamily = 'Noto Sans JP',
    fontWeight = '700',
    bulletFontSize = 38,
    kanpeFontSize = 22,
  } = options

  await ensureFont(fontFamily, fontWeight)
  await ensureFont(fontFamily, '400')
  await ensureFont(fontFamily, '500')

  const canvas = document.createElement('canvas')
  canvas.width = SLIDE_WIDTH
  canvas.height = SLIDE_HEIGHT
  const ctx = canvas.getContext('2d')

  // 背景
  drawDarkGradientBg(ctx)

  // 装飾
  ctx.fillStyle = 'rgba(239, 68, 68, 0.03)'
  ctx.beginPath()
  ctx.arc(SLIDE_WIDTH - 200, -100, 400, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(99, 102, 241, 0.02)'
  ctx.beginPath()
  ctx.arc(200, SLIDE_HEIGHT + 50, 300, 0, Math.PI * 2)
  ctx.fill()

  // ── タイトルエリア ──
  const titleY = 55
  fillRoundRect(ctx, 80, titleY, 5, 50, 3, '#EF4444')

  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.font = `${fontWeight} 42px "${fontFamily}"`
  ctx.fillStyle = '#FFFFFF'
  const titleLines = wrapText(ctx, stepTitle, SLIDE_WIDTH - 200)
  ctx.fillText(titleLines[0] || stepTitle, 105, titleY + 40)

  // ── 箇条書きエリア ──
  const bulletAreaY = 150
  const bulletAreaH = 640
  const bulletPanelX = 80
  const bulletPanelW = SLIDE_WIDTH - 160

  fillRoundRect(ctx, bulletPanelX, bulletAreaY, bulletPanelW, bulletAreaH, 20, 'rgba(255, 255, 255, 0.04)')
  strokeRoundRect(ctx, bulletPanelX, bulletAreaY, bulletPanelW, bulletAreaH, 20, 'rgba(255, 255, 255, 0.06)')

  const bulletLineH = bulletFontSize * 1.6
  const bulletPadX = 60
  const bulletPadY = 50
  const bulletMaxW = bulletPanelW - bulletPadX * 2 - 60

  for (let i = 0; i < visibleCount && i < bullets.length; i++) {
    const isLatest = i === visibleCount - 1
    const baseY = bulletAreaY + bulletPadY + i * (bulletLineH * 1.8 + 20)

    const markerX = bulletPanelX + bulletPadX
    const markerY = baseY + bulletFontSize * 0.35

    if (isLatest) {
      // 最新項目: 赤マーカー + 白テキスト
      ctx.fillStyle = '#EF4444'
      ctx.beginPath()
      ctx.arc(markerX + 8, markerY, 10, 0, Math.PI * 2)
      ctx.fill()

      ctx.font = `${fontWeight} ${bulletFontSize}px "${fontFamily}"`
      ctx.fillStyle = '#FFFFFF'
    } else {
      // 既出項目: 暗いマーカー + グレーテキスト
      ctx.fillStyle = 'rgba(239, 68, 68, 0.35)'
      ctx.beginPath()
      ctx.arc(markerX + 8, markerY, 8, 0, Math.PI * 2)
      ctx.fill()

      ctx.font = `500 ${bulletFontSize}px "${fontFamily}"`
      ctx.fillStyle = 'rgba(255, 255, 255, 0.55)'
    }

    // テキスト描画（BudouX折り返し）
    const textX = markerX + 35
    const lines = wrapText(ctx, bullets[i], bulletMaxW)
    for (let li = 0; li < lines.length; li++) {
      ctx.fillText(lines[li], textX, baseY + bulletFontSize + li * bulletLineH)
    }
  }

  // ── カンペエリア（最下部）──
  if (kanpeText && kanpeText.trim()) {
    const kanpeAreaY = SLIDE_HEIGHT - 180
    const kanpeAreaH = 160
    const kanpePadX = 40
    const kanpePadY = 15

    fillRoundRect(ctx, 0, kanpeAreaY, SLIDE_WIDTH, kanpeAreaH, 0, 'rgba(0, 0, 0, 0.55)')
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, kanpeAreaY)
    ctx.lineTo(SLIDE_WIDTH, kanpeAreaY)
    ctx.stroke()

    // ラベル
    ctx.font = `700 14px "${fontFamily}"`
    ctx.fillStyle = 'rgba(251, 191, 36, 0.6)'
    ctx.textAlign = 'left'
    ctx.fillText('SCRIPT', kanpePadX, kanpeAreaY + 22)

    // カンペテキスト（BudouX折り返し）
    ctx.font = `400 ${kanpeFontSize}px "${fontFamily}"`
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)'
    const kanpeMaxW = SLIDE_WIDTH - kanpePadX * 2
    const kanpeLines = wrapText(ctx, kanpeText.trim(), kanpeMaxW)
    const kanpeLineH = kanpeFontSize * 1.5
    const maxKanpeLines = Math.floor((kanpeAreaH - 35 - kanpePadY) / kanpeLineH)

    for (let i = 0; i < Math.min(kanpeLines.length, maxKanpeLines); i++) {
      ctx.fillText(kanpeLines[i], kanpePadX, kanpeAreaY + 40 + kanpePadY + i * kanpeLineH)
    }
  }

  const url = canvas.toDataURL('image/png')
  return { url, pageText: bullets.slice(0, visibleCount).join('\n') }
}

/**
 * 1ステップについてプログレッシブ箇条書きスライド群を生成
 * bullets.length 枚のスライドを返す
 */
export async function compositeBulletProgressiveSet(stepTitle, bullets, kanpeChunks, options = {}) {
  const results = []
  for (let i = 1; i <= bullets.length; i++) {
    const kanpe = kanpeChunks[i - 1] || ''
    const slide = await compositeBulletSlide(stepTitle, bullets, i, kanpe, options)
    results.push(slide)
  }
  return results
}

/**
 * カンペテキストを N 分割
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
    const end = Math.min(start + perChunk, paragraphs.length)
    result.push(paragraphs.slice(start, end).join('\n'))
  }
  return result
}
