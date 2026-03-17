import React, { useRef, useEffect, useState } from 'react'
import { Layers, AlertCircle, Download, DownloadCloud } from 'lucide-react'
import JSZip from 'jszip'

async function downloadImage(url, filename) {
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

async function downloadAllAsZip(results, zipName) {
  const slides = results.filter(r => r.compositeUrl && !r.error)
  const zip = new JSZip()
  const baseName = zipName.replace(/\.zip$/i, '') || 'yt-slides'

  for (let i = 0; i < slides.length; i++) {
    const res = await fetch(slides[i].compositeUrl)
    const blob = await res.blob()
    zip.file(`${baseName}-${String(i + 1).padStart(3, '0')}.png`, blob)
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' })
  const blobUrl = URL.createObjectURL(zipBlob)
  const a = document.createElement('a')
  a.href = blobUrl
  a.download = `${baseName}.zip`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(blobUrl)
}

function ExportControls({ results }) {
  const [filename, setFilename] = useState('yt-slides')
  const [zipping, setZipping] = useState(false)

  const handleZip = async () => {
    setZipping(true)
    try {
      await downloadAllAsZip(results, filename)
    } finally {
      setZipping(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={filename}
        onChange={(e) => setFilename(e.target.value)}
        className="px-2 py-1.5 rounded-lg glass-dark text-xs text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-red-500/40 w-36"
        placeholder="ファイル名"
      />
      <span className="text-xs text-white/30">.zip</span>
      <button
        onClick={handleZip}
        disabled={zipping}
        className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition disabled:opacity-50"
      >
        <DownloadCloud size={14} />
        {zipping ? 'ZIP作成中...' : '連番PNG (.zip)'}
      </button>
    </div>
  )
}

export default function OutputFeed({ results, statusMessage }) {
  const feedRef = useRef(null)

  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight
    }
  }, [results, statusMessage])

  const successResults = results.filter(r => r.compositeUrl && !r.error)

  if (results.length === 0 && !statusMessage) {
    return (
      <div className="flex-1 flex items-center justify-center text-white/20">
        <div className="text-center">
          <Layers size={48} className="mx-auto mb-3 opacity-50" />
          <p className="text-sm">生成された収録スライドがここに表示されます</p>
          <p className="text-xs mt-2 text-white/10">台本を入力して [---STEP---] で区切り、「収録スライド生成」を押してください</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* 一括ダウンロード */}
      {successResults.length > 0 && !statusMessage && (
        <div className="flex items-center justify-between mb-3 flex-shrink-0">
          <span className="text-xs text-white/40">{successResults.length} 枚の連番スライドを生成済み</span>
          <ExportControls results={results} />
        </div>
      )}

      <div ref={feedRef} className="flex-1 overflow-y-auto space-y-4 pr-1">
        {results.map((item, i) => (
          <div
            key={i}
            className="glass-dark p-4 animate-fade-in-up"
            style={{ animationDelay: `${Math.min(i * 0.05, 1)}s` }}
          >
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-500/20 text-red-300">
                #{String(i + 1).padStart(3, '0')}
              </span>
              {item.isNavSlide && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300">
                  ナビゲーション
                </span>
              )}
              {item.isBulletSlide && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300">
                  箇条書き {item.bulletIndex + 1}/{item.totalBullets}
                </span>
              )}
              {item.error && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 flex items-center gap-1">
                  <AlertCircle size={10} /> エラー
                </span>
              )}
            </div>

            {item.error ? (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                <p className="text-sm text-red-300">{item.error}</p>
              </div>
            ) : item.compositeUrl ? (
              <div className="relative group">
                <img
                  src={item.compositeUrl}
                  alt={`スライド ${i + 1}`}
                  className="w-full rounded-lg"
                  loading="lazy"
                />
                <button
                  onClick={() => downloadImage(item.compositeUrl, `yt-slide-${String(i + 1).padStart(3, '0')}.png`)}
                  className="absolute top-2 right-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/60 text-white text-xs opacity-0 group-hover:opacity-100 transition hover:bg-black/80"
                >
                  <Download size={13} /> 保存
                </button>
              </div>
            ) : null}
          </div>
        ))}

        {/* ステータス */}
        {statusMessage && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 animate-fade-in-up">
            <div className="w-2 h-2 rounded-full bg-red-400 pulse-dot" />
            <span className="text-sm text-red-300">{statusMessage}</span>
          </div>
        )}
      </div>
    </div>
  )
}
