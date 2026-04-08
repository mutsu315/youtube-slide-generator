import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { Play, Square, Video } from 'lucide-react'
import Sidebar from './components/Sidebar'
import ScriptInput from './components/ScriptInput'
import OutputFeed from './components/OutputFeed'
import ChapterList from './components/ChapterList'
import { runYouTubePipeline, detectChapters } from './lib/engine'
import {
  compositeNavigationSlide,
  compositeBulletProgressiveSet,
  splitKanpeText,
} from './lib/compositor'

export default function App() {
  const [config, setConfig] = useState({
    googleApiKey: '',
    openaiApiKey: '',
    provider: 'google',
    llmModel: 'gemini-2.5-flash',
    fontFamily: 'Noto Sans JP',
    fontWeight: '700',
    selectedCharacterIds: [],
    characterRoles: {},
  })

  const [script, setScript] = useState(() => localStorage.getItem('yt-gen-script') || '')
  const [results, setResults] = useState([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatingChapterIndex, setGeneratingChapterIndex] = useState(null)
  const [statusMessage, setStatusMessage] = useState('')
  const [chapterStatus, setChapterStatus] = useState({}) // { [idx]: 'idle'|'generating'|'done'|'error', [`${idx}_count`]: number }
  const abortControllerRef = useRef(null)

  // 台本が変わるたびに章を再検出
  const chapters = useMemo(() => detectChapters(script), [script])

  // 章が変わったら章ステータスをリセット（既存分は保持）
  useEffect(() => {
    setChapterStatus({})
  }, [chapters.length])

  const handleScriptChange = useCallback((value) => {
    setScript(value)
    localStorage.setItem('yt-gen-script', value)
  }, [])

  const handleConfigChange = useCallback((patch) => {
    setConfig((prev) => ({ ...prev, ...patch }))
  }, [])

  // ── 共通スライド生成処理 ────────────────────────────────
  const runPipeline = async (pipelineOptions, onSlides) => {
    const compositorOpts = { fontFamily: config.fontFamily, fontWeight: config.fontWeight }
    const controller = new AbortController()
    abortControllerRef.current = controller

    await runYouTubePipeline({
      ...pipelineOptions,
      apiKey: config.googleApiKey || 'local',
      script: pipelineOptions.script || '',
      llmModel: config.llmModel,
      provider: config.provider,
      extractionMode: config.extractionMode,
      abortController: controller,
      compositorOptions: compositorOpts,
      onProgress: async (event) => {
        switch (event.type) {
          case 'yt-start':
            setStatusMessage(`全 ${event.total} ステップの収録スライドを生成開始...`)
            break
          case 'yt-step-start':
          case 'yt-bullets-extracted':
            setStatusMessage(event.message)
            break
          case 'yt-render-nav': {
            try {
              const navSlide = await compositeNavigationSlide(event.steps, event.stepIndex, event.compositorOptions)
              onSlides([{ 
                compositeUrl: navSlide.url, 
                pageText: navSlide.pageText, 
                isNavSlide: true, 
                stepIndex: event.stepIndex,
                stepTitle: event.steps[event.stepIndex]?.title || '',
                pptxLayout: config.pptxLayout
              }])
            } catch (err) {
              console.error('[nav-slide] error:', err)
            }
            break
          }
          case 'yt-render-bullets': {
            try {
              const isObj = event.bullets.length > 0 && typeof event.bullets[0] === 'object'
              const kanpeChunks = !isObj ? splitKanpeText(event.body, event.bullets.length) : []
              
              const textArray = event.bullets.map(b => isObj ? (b.text || b.title || ' ') : b)

              const bulletSlides = await compositeBulletProgressiveSet(event.stepTitle, textArray, kanpeChunks, event.compositorOptions)
              
              onSlides(bulletSlides.map((slide, bi) => {
                const bullet = event.bullets[bi]
                const bText = isObj ? (bullet.text || bullet.title || ' ') : bullet
                const kanpe = isObj ? (bullet.kanpe || '') : (kanpeChunks[bi] || '')
                const layout = isObj && bullet.pattern ? bullet.pattern : config.pptxLayout

                return {
                  compositeUrl: slide.url,
                  pageText: slide.pageText || bText,
                  isBulletSlide: true,
                  stepIndex: event.stepIndex,
                  stepTitle: isObj && bullet.title ? bullet.title : event.stepTitle,
                  bulletIndex: bi,
                  totalBullets: event.bullets.length,
                  kanpeText: kanpe,
                  pptxLayout: layout,
                  diagram: isObj ? bullet.diagram : null
                }
              }))
            } catch (err) {
              console.error('[bullet-slide] error:', err)
            }
            break
          }
          case 'stopped':
            setStatusMessage('生成を停止しました')
            break
          case 'yt-done':
            setStatusMessage('収録スライド生成が完了しました')
            break
          case 'yt-step-complete':
            setStatusMessage(event.message)
            break
        }
      },
    })
  }

  // ── 1章だけ生成 ─────────────────────────────────────────
  const handleGenerateChapter = useCallback(async (chapterIndex) => {
    if (isGenerating) return
    const chapter = chapters[chapterIndex]
    if (!chapter) return

    setIsGenerating(true)
    setGeneratingChapterIndex(chapterIndex)
    setChapterStatus(prev => ({ ...prev, [chapterIndex]: 'generating' }))

    const newSlides = []

    try {
      await runPipeline({ chapters, targetChapterIndex: chapterIndex }, (slides) => {
        newSlides.push(...slides)
        setResults(prev => {
          // 既存のこの章のスライドを削除して差し替え
          const others = prev.filter(r => r._chapterIndex !== chapterIndex)
          return [...others, ...slides.map(s => ({ ...s, _chapterIndex: chapterIndex }))]
        })
      })
      setChapterStatus(prev => ({
        ...prev,
        [chapterIndex]: 'done',
        [`${chapterIndex}_count`]: newSlides.length,
      }))
    } catch (err) {
      if (err.name !== 'AbortError') {
        setChapterStatus(prev => ({ ...prev, [chapterIndex]: 'error' }))
        setStatusMessage(`エラー: ${err.message}`)
      }
    } finally {
      setIsGenerating(false)
      setGeneratingChapterIndex(null)
      abortControllerRef.current = null
    }
  }, [chapters, isGenerating, config])

  // ── 全章まとめて生成 ─────────────────────────────────────
  const handleGenerateAll = useCallback(async () => {
    if (isGenerating) return
    if (!script.trim()) {
      setStatusMessage('台本を入力してください')
      setTimeout(() => setStatusMessage(''), 3000)
      return
    }

    setIsGenerating(true)
    setResults([])
    setChapterStatus({})
    setStatusMessage('全章の収録スライド生成を開始...')

    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      if (chapters.length === 0) {
        throw new Error('章が検出できませんでした')
      }

      for (let i = 0; i < chapters.length; i++) {
        if (controller.signal.aborted) break
        
        setGeneratingChapterIndex(i)
        setChapterStatus(prev => ({ ...prev, [i]: 'generating' }))

        const newSlides = []
        await runPipeline({ chapters, targetChapterIndex: i }, (slides) => {
          newSlides.push(...slides)
          setResults(prev => [...prev, ...slides.map(s => ({ ...s, _chapterIndex: i }))])
        })
        
        setChapterStatus(prev => ({
          ...prev,
          [i]: 'done',
          [`${i}_count`]: newSlides.length,
        }))
      }
      
      if (!controller.signal.aborted) {
        setStatusMessage('全章の生成が完了しました')
      }
    } catch (err) {
      if (err.name !== 'AbortError') setStatusMessage(`エラー: ${err.message}`)
    } finally {
      setIsGenerating(false)
      setGeneratingChapterIndex(null)
      abortControllerRef.current = null
    }
  }, [script, chapters, isGenerating, config])

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      setStatusMessage('停止中...')
    }
  }

  return (
    <div className="h-screen flex">
      <Sidebar config={config} onConfigChange={handleConfigChange} />

      <div className="flex-1 flex flex-col p-6 gap-4 overflow-hidden">
        <header>
          <div className="flex items-center gap-3">
            <Video size={24} className="text-red-400" />
            <h1 className="text-xl font-bold tracking-tight">
              YouTube収録スライド生成
            </h1>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 font-medium">
              フルオート収録モード
            </span>
          </div>
          <p className="text-xs text-white/50 mt-1 ml-9">
            台本からナビゲーション＋テロップ連番スライドを自動生成。PDFでダウンロード可能。
          </p>
        </header>

        <div className="flex-1 flex flex-col gap-3 min-h-0">
          {/* 台本入力 */}
          <div className="glass p-4 flex-shrink-0" style={{ maxHeight: '28vh' }}>
            <ScriptInput script={script} onScriptChange={handleScriptChange} />
          </div>

          {/* 章リスト（検出された場合のみ表示） */}
          {chapters.length > 0 && (
            <ChapterList
              chapters={chapters}
              chapterStatus={chapterStatus}
              onGenerateChapter={handleGenerateChapter}
              results={results}
            />
          )}

          {/* 操作ボタン */}
          <div className="flex items-center gap-3 flex-shrink-0">
            {/* 全章まとめて生成ボタン */}
            <button
              onClick={handleGenerateAll}
              disabled={isGenerating}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-medium text-sm transition btn-glow ${
                isGenerating
                  ? 'bg-red-500/30 text-white/40 cursor-not-allowed'
                  : 'bg-red-600 hover:bg-red-500 text-white'
              }`}
            >
              <Play size={16} />
              {chapters.length > 1 ? `全${chapters.length}章を一括生成` : '収録スライド生成'}
            </button>

            {isGenerating && (
              <button
                onClick={handleStop}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl font-medium text-sm bg-gray-600 hover:bg-gray-500 text-white transition btn-stop"
              >
                <Square size={16} />
                停止
              </button>
            )}

            {statusMessage && !isGenerating && (
              <span className="text-sm text-white/50">{statusMessage}</span>
            )}
            {isGenerating && statusMessage && (
              <span className="text-sm text-red-300">{statusMessage}</span>
            )}
          </div>

          {/* スライドプレビュー */}
          <div className="glass p-4 flex-1 flex flex-col min-h-0 overflow-hidden">
            <OutputFeed
              results={results}
              statusMessage={isGenerating ? statusMessage : ''}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
