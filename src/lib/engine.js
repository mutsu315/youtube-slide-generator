/**
 * YouTube収録スライド生成エンジン v2
 *
 * - LLM API不使用。ローカル処理のみで100%安定動作
 * - 台本の「刺さる一言」を verbatim（そのまま）抽出してテロップ化
 * - 1チャプター = 複数枚テロップ（5~10秒ごとに切り替わる密度）
 */

// ── 章検出（各種フォーマット対応） ───────────────────────

/**
 * 台本から章を自動検出する（[---STEP---] 以外のフォーマットにも対応）
 * - [---STEP---] タグ
 * - # / ## / ### Markdown 見出し
 * - 第N章 / 第一章
 * - CHAPTER N / STEP N
 * - ■ タイトル
 * @param {string} text
 * @returns {{ title: string, body: string }[]}
 */
export function detectChapters(text) {
  if (!text || !text.trim()) return []

  const SEPARATOR = /^(?:\[---?STEP---?\]|#{1,3}\s+.+|第[一二三四五六七八九十百千\d]+章.*|(?:CHAPTER|chapter|STEP)\s*\d+.*|[■□▶]\s+.+)$/

  const lines = text.split('\n')
  const chapters = []
  let currentTitle = null
  let currentBody = []
  let foundAny = false

  const extractTitle = (line) => {
    const l = line.trim()
    let m
    if ((m = l.match(/^\[---?STEP---?\]/))) return null // タイトルは次の行
    if ((m = l.match(/^#{1,3}\s+(.+)/))) return m[1].trim()
    if ((m = l.match(/^第[一二三四五六七八九十百千\d]+章[\s:：]*(.*)/))) return m[0].trim()
    if ((m = l.match(/^(?:CHAPTER|chapter|STEP)\s*\d+[\s:：]*(.*)/))) return m[0].trim()
    if ((m = l.match(/^[■□▶]\s+(.+)/))) return m[1].trim()
    return ''
  }

  let skipNextAsTitle = false // [---STEP---] の次の行をタイトルとして使う

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const stripped = line.trim()

    if (stripped.match(/^\[---?STEP---?\]/)) {
      if (currentTitle !== null) {
        chapters.push({ title: currentTitle, body: currentBody.join('\n').trim() })
      }
      currentTitle = null
      currentBody = []
      skipNextAsTitle = true
      foundAny = true
      continue
    }

    if (skipNextAsTitle && stripped) {
      currentTitle = stripped
      skipNextAsTitle = false
      continue
    }

    if (SEPARATOR.test(stripped) && !stripped.match(/^\[---?STEP---?\]/)) {
      const title = extractTitle(stripped)
      if (title !== null) {
        if (currentTitle !== null) {
          chapters.push({ title: currentTitle, body: currentBody.join('\n').trim() })
        }
        currentTitle = title || `チャプター ${chapters.length + 1}`
        currentBody = []
        foundAny = true
        continue
      }
    }

    currentBody.push(line)
  }

  if (currentTitle !== null) {
    chapters.push({ title: currentTitle, body: currentBody.join('\n').trim() })
  }

  // 区切りが1つも見つからなければ全体を1チャプターとして扱う
  if (!foundAny && text.trim()) {
    const allLines = text.split('\n')
    return [{ title: allLines[0].trim() || 'チャプター 1', body: allLines.slice(1).join('\n').trim() }]
  }

  return chapters.filter(c => c.title || c.body)
}

// ── パーサー ──────────────────────────────────────────────

/**
 * [---STEP---] で台本を分割
 * 先頭行 = チャプタータイトル、残り = 本文
 */
export function parseYouTubeScript(text) {
  const parts = text.split(/\[---?STEP---?\]/gi).map(s => s.trim()).filter(Boolean)
  return parts.map((part, index) => {
    const lines = part.split('\n')
    const title = lines[0]?.trim() || `チャプター ${index + 1}`
    const body = lines.slice(1).join('\n').trim()
    return { index, title, body }
  })
}

// ── テロップ抽出（ローカル処理） ─────────────────────────

/**
 * 台本テキストから「テロップとして映える一文」をそのまま抽出する
 *
 * 方針:
 * - リライト・要約は一切しない（verbatim）
 * - 5〜10秒ごとに画面が切り替わる密度（最大15枚）を目安に抽出
 * - エラーメッセージは絶対に返さない
 *
 * @param {string} body - ステップ本文
 * @param {string} title - ステップタイトル（フォールバック用）
 * @returns {string[]} テロップフレーズ配列
 */
export function extractTelopLocal(body, title) {
  if (!body || body.trim().length === 0) {
    return [title]
  }

  // クリーニング：記号除去・空行除去
  const cleaned = body
    .replace(/[#*■「」【】〔〕『』（）()・…━─│]/g, '')
    .replace(/　/g, ' ')
    .trim()

  // 文単位で分割（句点・感嘆符・疑問符・改行）
  const rawSentences = cleaned
    .split(/(?<=[。！？])|(?:\n{1,2})/)
    .map(s => s.trim())
    .filter(s => s.length >= 8) // 短すぎる断片を除外

  // テロップ適性スコアリング（高スコア順にソートして上位を採用）
  const TELOP_MAX_LEN = 48 // 1行に収まる最大文字数
  const scored = rawSentences.map(s => {
    let score = 0
    const len = s.length

    // 長さ適正（テロップとして読みやすい）
    if (len >= 12 && len <= TELOP_MAX_LEN) score += 3
    else if (len <= 8 || len > 60) score -= 2

    // 数字・数値表現を含む（インパクト大）
    if (/[0-9０-９]/.test(s)) score += 3
    if (/万円|億円|%|パーセント|年|ヶ月|倍|位/.test(s)) score += 2

    // 断言・結論文（「〜です」「〜ます」で明確に終わる）
    if (/です。$|ます。$|でしょう。$/.test(s)) score += 2

    // 変化・対比・強調表現
    if (/できる|変わる|なくなる|わかる|増える|減る|負ける|勝てる/.test(s)) score += 1
    if (/大切|重要|絶対|必ず|ポイント|コツ|法則|鉄則/.test(s)) score += 1

    // 疑問形（視聴者を引き込む）
    if (/か？$|でしょうか。$/.test(s)) score += 1

    return { text: s, score, len }
  })

  // 全文をスライド化（スコアフィルタなし・順番保持）
  const MAX_TELOP = 30 // 1チャプター最大30枚

  const qualified = scored
    .filter(item => item.len >= 8 && item.len <= TELOP_MAX_LEN)
    .slice(0, MAX_TELOP)
    .map(item => item.text)

  if (qualified.length > 0) return qualified

  // フォールバック：条件を緩めて最初から3文
  const fallback = rawSentences
    .filter(s => s.length <= 60)
    .slice(0, 3)

  return fallback.length > 0 ? fallback : [title]
}

// ── ユーティリティ ───────────────────────────────────────

export function detectProvider(apiKey) {
  if (!apiKey) return 'google'
  if (apiKey.startsWith('AIza')) return 'google'
  if (apiKey.startsWith('sk-')) return 'openai'
  return 'google'
}

// ── メインパイプライン ─────────────────────────────────

/**
 * YouTube収録モード用メインパイプライン
 *
 * 出力順序（各ステップ）:
 *   1. チャプター扉スライド
 *   2. テロップスライド × N枚（台本の刺さる一言を順番に）
 */
export async function runYouTubePipeline({
  apiKey,
  script,
  chapters = null,
  targetChapterIndex = -1,
  llmModel = '',
  provider = '',
  abortController,
  onProgress,
  compositorOptions = {},
}) {
  const signal = abortController.signal
  const steps = chapters || parseYouTubeScript(script)

  if (steps.length === 0) {
    throw new Error('台本から章が見つかりませんでした。')
  }

  const indicesToRun = targetChapterIndex >= 0 ? [targetChapterIndex] : steps.map((_, i) => i)

  onProgress?.({ type: 'yt-start', total: indicesToRun.length })

  for (let si of indicesToRun) {
    if (signal.aborted) break
    const step = steps[si]

    onProgress?.({
      type: 'yt-step-start',
      stepIndex: si,
      total: steps.length,
      title: step.title,
      message: `チャプター ${si + 1}/${steps.length}「${step.title}」: テロップ抽出中...`,
    })

    // ローカルでテロップ抽出（API不要・必ず成功）
    const telops = extractTelopLocal(step.body, step.title)

    if (signal.aborted) break

    onProgress?.({
      type: 'yt-bullets-extracted',
      stepIndex: si,
      bullets: telops,
      message: `チャプター ${si + 1}: テロップ ${telops.length} 枚 → スライド描画中...`,
    })

    // チャプター扉スライド
    onProgress?.({
      type: 'yt-render-nav',
      stepIndex: si,
      steps,
      compositorOptions,
    })

    // テロップスライド群
    onProgress?.({
      type: 'yt-render-bullets',
      stepIndex: si,
      stepTitle: step.title,
      bullets: telops,
      body: step.body,
      compositorOptions,
    })

    onProgress?.({
      type: 'yt-step-complete',
      stepIndex: si,
      total: steps.length,
      message: `チャプター ${si + 1}/${steps.length}「${step.title}」完了`,
    })
  }

  if (signal.aborted) {
    onProgress?.({ type: 'stopped' })
  } else {
    onProgress?.({ type: 'yt-done' })
  }
}
