import React, { useRef } from 'react'
import { FileText, ListOrdered } from 'lucide-react'

const EXAMPLE_SCRIPT = `はじめに：今日のテーマ
今日はAIを使った動画制作の全体像をお話しします。
この動画を見れば、初心者でも一人でAI動画を作れるようになります。

[---STEP---]

ステップ1：企画と台本づくり
まず最初にやるべきことは、企画と台本づくりです。
いきなりカメラの前に立つのではなく、まず話す内容を整理しましょう。
台本があることで、話がブレず、テンポよく進められます。

[---STEP---]

ステップ2：スライドの準備
次に、スライドを準備します。
AIツールを使えば、台本からスライドを自動生成できます。
背景画像やレイアウトもワンクリックで完成します。

[---STEP---]

ステップ3：収録と編集
最後に、スライドを見ながらクリックで進めて一発撮りします。
カンペが画面下に表示されるので、台本を覚える必要はありません。`

export default function ScriptInput({ script, onScriptChange }) {
  const textareaRef = useRef(null)

  const stepCount = script.trim()
    ? script.split(/\[---?STEP---?\]/gi).filter(s => s.trim()).length
    : 0

  const insertSeparator = () => {
    const ta = textareaRef.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const sep = '\n\n[---STEP---]\n\n'
    const newScript = script.slice(0, start) + sep + script.slice(end)
    onScriptChange(newScript)

    requestAnimationFrame(() => {
      const pos = start + sep.length
      ta.focus()
      ta.setSelectionRange(pos, pos)
    })
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <label className="flex items-center gap-2 text-sm font-medium text-red-300">
          <FileText size={16} />
          台本入力
        </label>
        <div className="flex items-center gap-2">
          <button
            onClick={insertSeparator}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium bg-red-500/20 text-red-300 hover:bg-red-500/30 transition"
            title="カーソル位置に [---STEP---] タグを挿入"
          >
            <ListOrdered size={13} />
            ステップ区切り挿入
          </button>
          {stepCount > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-300">
              {stepCount} ステップ
            </span>
          )}
        </div>
      </div>
      <textarea
        ref={textareaRef}
        value={script}
        onChange={(e) => onScriptChange(e.target.value)}
        placeholder={EXAMPLE_SCRIPT}
        className="flex-1 w-full p-4 rounded-xl glass-dark text-sm text-white/90 leading-relaxed placeholder-white/20 min-h-[200px] font-mono"
        spellCheck={false}
      />
    </div>
  )
}
