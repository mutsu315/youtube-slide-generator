/**
 * YouTube収録スライド生成エンジン
 *
 * 台本を [---STEP---] で分割し、各ステップに対して:
 * 1. LLMで箇条書き（3〜4項目）を抽出
 * 2. ナビゲーションスライドを生成（compositor に委譲）
 * 3. 箇条書きプログレッシブスライドを生成（compositor に委譲）
 *
 * 対応プロバイダー: Google (Gemini) / OpenAI (GPT)
 */

// ── パーサー ──────────────────────────────────────────────

/**
 * YouTube収録用の台本を [---STEP---] で分割
 * 各ステップの先頭行がタイトル、残りが本文（台本テキスト）
 */
export function parseYouTubeScript(text) {
  const parts = text.split(/\[---?STEP---?\]/gi).map(s => s.trim()).filter(Boolean)
  return parts.map((part, index) => {
    const lines = part.split('\n')
    const title = lines[0]?.trim() || `ステップ ${index + 1}`
    const body = lines.slice(1).join('\n').trim()
    return { index, title, body }
  })
}

// ── ユーティリティ ───────────────────────────────────────

export function detectProvider(apiKey) {
  if (!apiKey) return 'openai'
  if (apiKey.startsWith('AIza')) return 'google'
  if (apiKey.startsWith('sk-')) return 'openai'
  return 'openai'
}

// ── 箇条書き抽出（LLM） ─────────────────────────────────

async function extractBulletsViaLLM(apiKey, stepText, stepTitle, llmModel, provider, signal) {
  const systemPrompt = `あなたはYouTube動画スライドの箇条書き抽出の専門家です。
与えられた台本テキストから、視聴者にとって最も重要な要点を3〜4項目の箇条書きとして抽出してください。

ルール:
- 各項目は35文字以内の簡潔な文にしてください
- 台本の核心をわかりやすく要約してください
- 必ずJSON形式のみで出力してください（説明文不要）

出力フォーマット:
{"bullets": ["要点1", "要点2", "要点3"]}`

  const userMessage = `【ステップタイトル】
${stepTitle}

【台本テキスト】
${stepText}

上記からJSON形式で箇条書きを3〜4項目抽出してください。`

  let responseText = ''

  if (provider === 'google') {
    const geminiModel = llmModel || 'gemini-2.5-flash'
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ parts: [{ text: userMessage }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 500 },
      }),
      signal,
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(`Gemini LLM エラー: ${res.status} - ${err.error?.message || res.statusText}`)
    }
    const data = await res.json()
    responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
  } else {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: llmModel || 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.3,
        max_tokens: 500,
      }),
      signal,
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(`OpenAI LLM エラー: ${res.status} - ${err.error?.message || res.statusText}`)
    }
    const data = await res.json()
    responseText = data.choices[0].message.content
  }

  // JSON抽出
  const jsonMatch = responseText.match(/\{[\s\S]*"bullets"[\s\S]*\}/)
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0])
      if (Array.isArray(parsed.bullets) && parsed.bullets.length > 0) {
        return parsed.bullets.slice(0, 5)
      }
    } catch { /* フォールバック */ }
  }

  // フォールバック: 箇条書き行を抽出
  const lines = responseText.split('\n').filter(l => l.match(/^[-・●▶\d]/))
  if (lines.length > 0) {
    return lines.slice(0, 4).map(l => l.replace(/^[-・●▶\d.)\s]+/, '').trim())
  }

  return ['（箇条書きを抽出できませんでした）']
}

// ── メインパイプライン ─────────────────────────────────

/**
 * YouTube収録モード用メインパイプライン
 *
 * 出力順序:
 *   各ステップについて:
 *   1. ナビゲーションスライド（現在ステップをハイライト）
 *   2. 箇条書きプログレッシブスライド × N枚
 *
 * Canvas描画は onProgress イベント経由で呼び出し元（App）に委譲
 */
export async function runYouTubePipeline({
  apiKey,
  script,
  llmModel = '',
  provider = '',
  abortController,
  onProgress,
  compositorOptions = {},
}) {
  const signal = abortController.signal
  const steps = parseYouTubeScript(script)
  const detectedProvider = provider || detectProvider(apiKey)

  if (steps.length === 0) {
    throw new Error('台本に [---STEP---] タグが見つかりませんでした。ステップごとに区切ってください。')
  }

  onProgress?.({ type: 'yt-start', total: steps.length, provider: detectedProvider })

  for (let si = 0; si < steps.length; si++) {
    if (signal.aborted) break
    const step = steps[si]

    onProgress?.({
      type: 'yt-step-start',
      stepIndex: si,
      total: steps.length,
      title: step.title,
      message: `ステップ ${si + 1}/${steps.length}「${step.title}」: 箇条書き抽出中...`,
    })

    // LLMで箇条書き抽出
    let bullets
    try {
      bullets = await extractBulletsViaLLM(
        apiKey, step.body, step.title, llmModel, detectedProvider, signal
      )
    } catch (err) {
      if (err.name === 'AbortError') break
      onProgress?.({ type: 'error', stepIndex: si, message: err.message })
      bullets = ['（箇条書き抽出に失敗しました）']
    }

    if (signal.aborted) break

    onProgress?.({
      type: 'yt-bullets-extracted',
      stepIndex: si,
      bullets,
      message: `ステップ ${si + 1}: 箇条書き ${bullets.length} 項目抽出 → スライド描画中...`,
    })

    // ナビゲーションスライド生成を呼び出し元に委譲
    onProgress?.({
      type: 'yt-render-nav',
      stepIndex: si,
      steps,
      compositorOptions,
    })

    // 箇条書きプログレッシブスライド生成を呼び出し元に委譲
    onProgress?.({
      type: 'yt-render-bullets',
      stepIndex: si,
      stepTitle: step.title,
      bullets,
      body: step.body,
      compositorOptions,
    })

    onProgress?.({
      type: 'yt-step-complete',
      stepIndex: si,
      total: steps.length,
      message: `ステップ ${si + 1}/${steps.length}「${step.title}」完了`,
    })
  }

  if (signal.aborted) {
    onProgress?.({ type: 'stopped' })
  } else {
    onProgress?.({ type: 'yt-done' })
  }
}
