import { useCallback, useEffect, useMemo, useRef } from 'react'
import { Link, useParams } from 'react-router-dom'
import { injectLegacyNativeFrame } from '../lib/native-shell'
import { useNativeApp } from '../hooks/useNativeApp'
import { legacyUrl } from '../lib/navigation'

export function LegacyPage() {
  const params = useParams()
  const path = params['*'] || ''
  const native = useNativeApp()
  const tracking = path.includes('onibus-agora') || path.includes('onibus-horarios')
  const src = useMemo(() => {
    const url = legacyUrl(`/${path}`)
    if (!native) return url
    const sep = url.includes('?') ? '&' : '?'
    return `${url}${sep}embed=native-app`
  }, [path, native])
  const frameRef = useRef<HTMLIFrameElement>(null)

  const syncNativeFrame = useCallback((frame: HTMLIFrameElement | null) => {
    if (!frame) return
    try {
      const doc = frame.contentDocument
      if (doc) injectLegacyNativeFrame(doc)
    } catch {
      /* mesma origem */
    }
  }, [])

  useEffect(() => {
    if (!native) return
    syncNativeFrame(frameRef.current)
    const timers = [80, 400, 1200].map((ms) =>
      window.setTimeout(() => syncNativeFrame(frameRef.current), ms),
    )
    return () => timers.forEach((id) => window.clearTimeout(id))
  }, [native, src, syncNativeFrame])

  const onFrameLoad = useCallback(
    (event: React.SyntheticEvent<HTMLIFrameElement>) => {
      syncNativeFrame(event.currentTarget)
    },
    [syncNativeFrame],
  )

  if (tracking) return null

  return (
    <section className={`legacy-page${native ? ' legacy-page--native' : ''}`}>
      {!native ? (
        <div className="legacy-toolbar">
          <Link to="/" className="btn-secondary">
            ← Voltar ao início
          </Link>
          <a href={src} target="_blank" rel="noreferrer" className="btn-ghost">
            Abrir em nova aba
          </a>
        </div>
      ) : null}
      <iframe
        ref={frameRef}
        title="Módulo legado do portal"
        src={src}
        className="legacy-frame"
        loading="eager"
        onLoad={onFrameLoad}
      />
    </section>
  )
}
