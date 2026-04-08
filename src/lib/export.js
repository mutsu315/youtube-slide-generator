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
    
    const isLeft = r.pptxLayout === 'left'

    // AIディレクターが出力したパターンかどうかの判定
    let pattern = r.pptxLayout
    if (!['A', 'B', 'C', 'D', 'E'].includes(pattern)) {
      if (r.isNavSlide) pattern = 'A' // 従来のナビゲーションはAとする
      else pattern = (isLeft ? 'B' : 'C') // 従来の弾丸は設定に合わせてBかC
    }

    const titleMain = r.stepTitle || r.pageText
    const titleSub = r.stepTitle && r.stepTitle !== r.pageText ? r.pageText : `CHAPTER ${r.stepIndex + 1}`
    const pageTxt = r.pageText || ''

    if (pattern === 'A') {
      // パターンA：左半分の背景を白で塗りつぶし
      s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: '50%', h: '100%', fill: { color: 'FFFFFF' } })
      
      s.addText(titleSub, {
        x: '8%', y: '40%', w: '38%', h: 0.5,
        fontSize: 24, color: 'CC0000', bold: true, align: 'left'
      })
      s.addText(titleMain, {
        x: '8%', y: '45%', w: '38%', h: 2,
        fontSize: 54, color: '000000', bold: true, align: 'left', valign: 'top'
      })
    } else if (pattern === 'B') {
      // パターンB：左半分に半透明白ボックス＋テキスト
      s.addShape(pptx.ShapeType.rect, { 
        x: '5%', y: '10%', w: '43%', h: '80%', 
        fill: { color: 'FFFFFF', transparency: 30 } 
      })
      
      s.addText(titleMain, {
        x: '8%', y: '15%', w: '37%', h: 0.5,
        fontSize: 20, color: '666666', align: 'left'
      })
      s.addText(pageTxt, {
        x: '8%', y: '25%', w: '37%', h: 4,
        fontSize: 44, color: '000000', bold: true, align: 'left', valign: 'middle'
      })
    } else if (pattern === 'C') {
      // パターンC：中央に半透明白ボックス＋テキスト
      s.addShape(pptx.ShapeType.rect, { 
        x: '10%', y: '15%', w: '80%', h: '70%', 
        fill: { color: 'FFFFFF', transparency: 30 } 
      })

      s.addText(titleMain, {
        x: '15%', y: '20%', w: '70%', h: 0.5,
        fontSize: 20, color: '666666', align: 'left'
      })
      s.addText(pageTxt, {
        x: '15%', y: '30%', w: '70%', h: 3,
        fontSize: 44, color: '000000', bold: true, align: 'left', valign: 'middle'
      })
    } else if (pattern === 'D') {
      // パターンD：複数ボックス・情報カード等（白背景のみ）
      s.addText(titleMain, {
        x: '5%', y: '5%', w: '90%', h: 0.5,
        fontSize: 24, color: 'CC0000', bold: true, align: 'center'
      })
      s.addText(pageTxt, {
        x: '5%', y: '12%', w: '90%', h: 1,
        fontSize: 32, color: '000000', bold: true, align: 'center', valign: 'top'
      })

      // ダイアグラムがあれば描画（カード）
      if (r.diagram && r.diagram.items && r.diagram.items.length > 0) {
        const items = r.diagram.items
        const count = items.length
        const totalW = 90
        const gap = 2
        const boxW = (totalW - (count - 1) * gap) / count
        const startX = 5

        items.forEach((item, idx) => {
          const x = startX + idx * (boxW + gap)
          const cleanColor = item.color ? item.color.replace('#', '') : '3182CE'
          
          // ボックスヘッダー
          s.addShape(pptx.ShapeType.rect, {
            x: `${x}%`, y: '25%', w: `${boxW}%`, h: '10%',
            fill: { color: cleanColor }
          })
          s.addText(item.title || `STEP ${idx+1}`, {
            x: `${x}%`, y: '25%', w: `${boxW}%`, h: '10%',
            fontSize: 20, color: 'FFFFFF', bold: true, align: 'center', valign: 'middle'
          })

          // ボックスボディ
          s.addShape(pptx.ShapeType.rect, {
            x: `${x}%`, y: '35%', w: `${boxW}%`, h: '50%',
            fill: { color: 'F7FAFC' },
            line: { color: cleanColor, width: 2 }
          })
          s.addText(item.content || '', {
            x: `${x + 2}%`, y: '37%', w: `${boxW - 4}%`, h: '46%',
            fontSize: 24, color: '333333', align: 'left', valign: 'top'
          })
        })
      }
    } else if (pattern === 'E') {
      // パターンE：感情的・ストーリー（背景画像暗めの前提で、文字は白）
      // 背景シェイプなし、文字は白く浮かび上がらせる
      s.addText(titleMain, {
        x: '10%', y: '20%', w: '80%', h: 0.5,
        fontSize: 20, color: 'DDDDDD', align: 'center'
      })
      s.addText(pageTxt, {
        x: '10%', y: '30%', w: '80%', h: 4,
        fontSize: 54, color: 'FFFFFF', bold: true, align: 'center', valign: 'middle',
        shadow: { type: 'outer', color: '000000', blur: 3, offset: 2 } 
      })
    }

    // スピーカーノート（カンペ）を追加
    if (r.kanpeText) {
      s.addNotes(r.kanpeText)
    }
  }

  await pptx.writeFile({ fileName: `${baseName}.pptx` })
}
