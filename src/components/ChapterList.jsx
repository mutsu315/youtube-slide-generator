import React, { useState } from 'react'
import { Play, CheckCircle, Loader, BookOpen, FileText, Presentation } from 'lucide-react'
import { downloadAsPdf, downloadAsPptx } from '../lib/export'

/**
 * 章リスト — 検出した章を一覧表示し、1章ずつ生成できる
 */
export default function ChapterList({ chapters, chapterStatus, onGenerateChapter, results = [] }) {
  const [filenamePrefix, setFilenamePrefix] = useState('chapter')

  if (!chapters || chapters.length === 0) return null

  return (
    <div className="glass p-4 flex-shrink-0" style={{ maxHeight: '30vh' }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <BookOpen size={14} className="text-white/50" />
          <span className="text-xs text-white/50 font-medium">
            {chapters.length} 章を検出
          </span>
          <span className="text-xs text-white/30 truncate max-w-[200px]">— 1章ずつ生成</span>
        </div>
        <input
          type="text"
          value={filenamePrefix}
          onChange={(e) => setFilenamePrefix(e.target.value)}
          className="px-2 py-1 rounded bg-black/40 text-[11px] text-white border border-white/10 w-32 focus:outline-none focus:border-red-500/50"
          placeholder="ファイル名プリフィクス"
          title="章ごとダウンロード時のファイル名の先頭"
        />
      </div>

      <div className="flex flex-col gap-2 overflow-y-auto" style={{ maxHeight: 'calc(30vh - 4rem)' }}>
        {chapters.map((chapter, i) => {
          const status = chapterStatus[i] || 'idle' // idle | generating | done | error
          const slideCount = chapterStatus[`${i}_count`] || 0

          return (
            <div
              key={i}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition ${
                status === 'done'
                  ? 'bg-emerald-500/10 border border-emerald-500/20'
                  : status === 'generating'
                  ? 'bg-red-500/10 border border-red-500/20'
                  : status === 'error'
                  ? 'bg-red-900/20 border border-red-700/20'
                  : 'bg-white/5 border border-white/10 hover:bg-white/10'
              }`}
            >
              {/* 番号 */}
              <span className="text-xs text-white/30 w-5 text-right flex-shrink-0">
                {String(i + 1).padStart(2, '0')}
              </span>

              {/* タイトル */}
              <span className="text-sm text-white/80 flex-1 truncate">
                {chapter.title}
              </span>

              {/* 文字数バッジ */}
              <span className="text-xs text-white/30 flex-shrink-0">
                {chapter.body.length}字
              </span>

              {/* スライド枚数（生成済みの場合） */}
              {status === 'done' && slideCount > 0 && (
                <span className="text-xs text-emerald-400 flex-shrink-0">
                  {slideCount}枚
                </span>
              )}

              {/* ステータスアイコン / ボタン */}
              {status === 'generating' ? (
                <Loader size={14} className="text-red-400 animate-spin flex-shrink-0" />
              ) : status === 'done' ? (
                <div className="flex items-center gap-1.5 flex-shrink-0 pl-2">
                  <CheckCircle size={14} className="text-emerald-400 mr-1" />
                  <button
                    onClick={() => {
                        const chapterResults = results.filter(r => r._chapterIndex === i)
                        downloadAsPdf(chapterResults, `${filenamePrefix || 'chapter'}-${String(i+1).padStart(2, '0')}`)
                    }}
                    className="flex items-center gap-1 px-2 py-1 rounded bg-blue-700/80 hover:bg-blue-600 text-white text-[10px] font-medium transition"
                    title="この章をPDFで保存"
                  >
                    <FileText size={12} /> PDF
                  </button>
                  <button
                    onClick={() => {
                        const chapterResults = results.filter(r => r._chapterIndex === i)
                        downloadAsPptx(chapterResults, `${filenamePrefix || 'chapter'}-${String(i+1).padStart(2, '0')}`)
                    }}
                    className="flex items-center gap-1 px-2 py-1 rounded bg-orange-600/80 hover:bg-orange-500 text-white text-[10px] font-medium transition"
                    title="この章をPPTXで保存"
                  >
                    <Presentation size={12} /> PPTX
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => onGenerateChapter(i)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-red-600 hover:bg-red-500 text-white text-xs transition flex-shrink-0"
                >
                  <Play size={10} />
                  生成
                </button>
              )}

              {/* 失敗時は再実行ボタン */}
              {status === 'error' && (
                <button
                  onClick={() => onGenerateChapter(i)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-yellow-600 hover:bg-yellow-500 text-white text-xs transition flex-shrink-0"
                >
                  <Play size={10} />
                  再実行
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
