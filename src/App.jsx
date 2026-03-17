import React, { useState, useRef, useCallback } from 'react'
import { Play, Square, Video } from 'lucide-react'
import Sidebar from './components/Sidebar'
import ScriptInput from './components/ScriptInput'
import OutputFeed from './components/OutputFeed'
import { runYouTubePipeline } from './lib/engine'
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
  const [statusMessage, setStatusMessage] = useState('')
  const abortControllerRef = useRef(null)

  const handleScriptChange = useCallback((value) => {
    setScript(value)
    localStorage.setItem('yt-gen-script', value)
  }, [])

  const handleConfigChange = useCallback((patch) => {
    setConfig((prev) => ({ ...prev, ...patch }))
  }, [])

  const activeApiKey = config.provider === 'google' ? config.googleApiKey : config.openaiApiKey

  const handleGenerate = async () => {
    if (!activeApiKey) {
      setStatusMessage(`${config.provider === 'google' ? 'Google' : 'OpenAI'} APIキーを入力してください`)
      setTimeout(() => setStatusMessage(''), 3000)
      return
    }
    if (!script.trim()) {
      setStatusMessage('台本を入力してください')
      setTimeout(() => setStatusMessage(''), 3000)
      return
    }

    setIsGenerating(true)
    setResults([])
    setStatusMessage('収録スライド生成を開始...')

    const controller = new AbortController()
    abortControllerRef.current = controller

    const compositorOpts = {
      fontFamily: config.fontFamily,
      fontWeight: config.fontWeight,
    }

    try {
      await runYouTubePipeline({
        apiKey: activeApiKey,
        script,
        llmModel: config.llmModel,
        provider: config.provider,
        abortController: controller,
        compositorOptions: compositorOpts,
        onProgress: async (event) => {
          switch (event.type) {
            case 'yt-start':
              setStatusMessage(`全 ${event.total} ステップの収録スライドを生成開始...`)
              break
            case 'yt-step-start':
              setStatusMessage(event.message)
              break
            case 'yt-bullets-extracted':
              setStatusMessage(event.message)
              break
            case 'yt-render-nav': {
              try {
                const navSlide = await compositeNavigationSlide(
                  event.steps,
                  event.stepIndex,
                  event.compositorOptions,
                )
                setResults((prev) => [...prev, {
                  compositeUrl: navSlide.url,
                  pageText: navSlide.pageText,
                  isNavSlide: true,
                  stepIndex: event.stepIndex,
                }])
              } catch (err) {
                console.error('[nav-slide] error:', err)
                setResults((prev) => [...prev, { error: `ナビスライド生成エラー: ${err.message}` }])
              }
              break
            }
            case 'yt-render-bullets': {
              try {
                const kanpeChunks = splitKanpeText(event.body, event.bullets.length)
                const bulletSlides = await compositeBulletProgressiveSet(
                  event.stepTitle,
                  event.bullets,
                  kanpeChunks,
                  event.compositorOptions,
                )
                const newItems = bulletSlides.map((slide, bi) => ({
                  compositeUrl: slide.url,
                  pageText: slide.pageText,
                  isBulletSlide: true,
                  stepIndex: event.stepIndex,
                  bulletIndex: bi,
                  totalBullets: event.bullets.length,
                }))
                setResults((prev) => [...prev, ...newItems])
              } catch (err) {
                console.error('[bullet-slide] error:', err)
                setResults((prev) => [...prev, { error: `箇条書きスライド生成エラー: ${err.message}` }])
              }
              break
            }
            case 'yt-step-complete':
              setStatusMessage(event.message)
              break
            case 'stopped':
              setStatusMessage('生成を停止しました')
              break
            case 'yt-done':
              setStatusMessage('収録スライド生成が完了しました')
              break
            case 'error':
              setResults((prev) => [...prev, { error: event.message }])
              break
          }
        },
      })
    } catch (err) {
      if (err.name !== 'AbortError') {
        setStatusMessage(`エラー: ${err.message}`)
      }
    } finally {
      setIsGenerating(false)
      abortControllerRef.current = null
    }
  }

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
            台本からナビゲーション＋箇条書き連番PNGを自動生成。クリックで進めるだけで収録完了。
          </p>
        </header>

        <div className="flex-1 flex flex-col gap-4 min-h-0">
          <div className="glass p-4 flex-shrink-0" style={{ maxHeight: '35vh' }}>
            <ScriptInput script={script} onScriptChange={handleScriptChange} />
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-medium text-sm transition btn-glow ${
                isGenerating
                  ? 'bg-red-500/30 text-white/40 cursor-not-allowed'
                  : 'bg-red-600 hover:bg-red-500 text-white'
              }`}
            >
              <Play size={16} />
              収録スライド生成
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
          </div>

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
