import { GoogleGenerativeAI } from '@google/generative-ai'

/**
 * AI Slide Director (Gemini 2.5 Flash)
 * Parses a chapter script and outputs an array of slide configurations,
 * assigning patterns A-E and diagrams based on the context.
 */
export async function directSlideGeneration(apiKey, title, body) {
  if (!apiKey || apiKey === 'local') {
    throw new Error('AIディレクターモードを使用するには、設定画面からGoogle API Key (Gemini) を保存してください。')
  }

  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" })

  const prompt = `あなたはプロのYouTubeスライドクリエイターです。
以下の「チャプターの台本」を読み込み、視聴者を飽きさせないように複数のスライドに分割してJSONで出力してください。

【スライドパターンのルール（重要）】
以下の5つのパターン（A, B, C, D, E）から、文脈に最も適したものを選んで "pattern" に指定してください。
連続して同じパターン（特にBとC）が続きすぎないよう、適度に散らしてください。

- "A" (左右分割): チャプターの最初の1枚目（タイトルスライド）には必ずこれを使用してください。
- "B" (左寄り): 最も多用する基本パターン。通常の解説で使用。
- "C" (中央): 基本パターン。Bと交互に使って単調さを防ぐ。
- "D" (図解): 「ステップ1, 2, 3」「〜つの理由」「AとBの比較」など、情報が箇条書きや複数要素に分かれる場合に使用。
- "E" (感情・暗め): 「行動しましょう」「失敗談」「マインドセット」「結論」など、感情を揺さぶるエモーショナルな文脈の場合に使用。

【出力形式】
以下のJSONスキーマの配列のみを出力してください。

[
  {
    "pattern": "A", // A, B, C, D, Eのいずれか
    "text": "スライドのメインの大きな文字（短く、1行〜3行程度でインパクトのあるもの）。不要な場合は空文字",
    "title": "（オプション）メイン文字の上に小さく表示するサブタイトル的な短い文字。不要なら空文字",
    "kanpe": "台本の元の文章。演者が読むためのカンペなので、原稿から該当する一節を要約せずにそのまま格納すること",
    "diagram": { // Pattern が "D" の場合のみ必須！それ以外は null
      "type": "steps", // steps, comparison, cards のいずれか
      "items": [
        { "title": "ステップ1など短い見出し", "content": "内容の短い説明", "color": "#3182CE" } // 色は必ず #付きのHEXコード
      ]
    }
  }
]

【チャプターのタイトル】
${title}

【チャプターの台本本文】
${body}
`

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json'
    }
  })

  try {
    const textData = result.response.text()
    return JSON.parse(textData)
  } catch (err) {
    console.error('Failed to parse AI Director JSON:', err)
    return []
  }
}
