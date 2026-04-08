import { jsPDF } from 'jspdf'
import PptxGenJS from 'pptxgenjs'

// ── 個別PNG保存 ──────────────────────────────────────────
export async function downloadImage(url, filename) {
  try {
    const res = await fetch(url)
    const blob = await res.blob()
    const blobUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(blobUrl)
  } catch {
    window.open(url, '_blank')
  }
}

// ── PDF一括保存 ──────────────────────────────────────────
export async function downloadAsPdf(results, baseName) {
  const slides = results.filter(r => r.compositeUrl && !r.error)
  if (slides.length === 0) return

  const W_MM = 192
  const H_MM = 108
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [W_MM, H_MM] })

  for (let i = 0; i < slides.length; i++) {
    if (i > 0) pdf.addPage([W_MM, H_MM], 'landscape')
    pdf.addImage(slides[i].compositeUrl, 'PNG', 0, 0, W_MM, H_MM)
  }

  pdf.save(`${baseName}.pdf`)
}

// ── PPTX一括保存 ─────────────────────────────────────────
export async function downloadAsPptx(results, baseName) {
  const slides = results.filter(r => r.compositeUrl && !r.error)
  if (slides.length === 0) return

  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_16x9'

  for (const r of slides) {
    const s = pptx.addSlide()
    
    // 背景を白（透明/単色）にする
    s.background = { color: 'FFFFFF' }

    if (r.isNavSlide) {
      // ナビゲーションスライド（見出し）
      s.addText(`CHAPTER ${r.stepIndex + 1}`, {
        x: '10%', y: '30%', w: '80%', h: 1,
        fontSize: 24, color: 'CC0000', bold: true, align: 'left'
      })
      s.addText(r.stepTitle || r.pageText, {
        x: '10%', y: '45%', w: '80%', h: 2,
        fontSize: 54, color: '000000', bold: true, align: 'left'
      })
    } else if (r.isBulletSlide) {
      // テロップスライド
      s.addText(r.stepTitle || '', {
        x: '5%', y: '10%', w: '90%', h: 0.5,
        fontSize: 18, color: '666666', align: 'left'
      })
      s.addText(r.pageText || '', {
        x: '5%', y: '30%', w: '90%', h: 3,
        fontSize: 44, color: '000000', bold: true, align: 'left', valign: 'middle'
      })
      // スピーカーノート（カンペ）を追加
      if (r.kanpeText) {
        s.addNotes(r.kanpeText)
      }
    } else {
      // フォールバック（通常は呼ばれない）
      s.addImage({
        data: r.compositeUrl,
        x: 0, y: 0, w: '100%', h: '100%',
      })
    }
  }

  await pptx.writeFile({ fileName: `${baseName}.pptx` })
}
