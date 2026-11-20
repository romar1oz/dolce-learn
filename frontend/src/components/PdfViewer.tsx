/* Просмотр PDF через pdf.js (работает офлайн: воркер включён в сборку и кэшируется Service Worker'ом). */
import { useEffect, useRef, useState } from 'react'
import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { ZoomIn, ZoomOut } from 'lucide-react'
import { Button, Spinner } from '@/components/ui'
import { useT } from '@/i18n'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export function PdfViewer({ url, onFullyViewed }: { url: string; onFullyViewed?: () => void }) {
  const box = useRef<HTMLDivElement>(null)
  const [doc, setDoc] = useState<pdfjs.PDFDocumentProxy | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [scale, setScale] = useState(1)
  const t = useT()

  useEffect(() => {
    let cancelled = false
    setDoc(null)
    setError(null)
    const task = pdfjs.getDocument({ url })
    task.promise.then((d) => !cancelled && setDoc(d)).catch((e) => !cancelled && setError(e?.message || 'PDF error'))
    return () => {
      cancelled = true
      void task.destroy()
    }
  }, [url])

  useEffect(() => {
    if (!doc || !box.current) return
    const container = box.current
    container.innerHTML = ''
    let cancelled = false
    const width = container.clientWidth || 600
    const render = async () => {
      for (let i = 1; i <= doc.numPages && !cancelled; i++) {
        const page = await doc.getPage(i)
        const base = page.getViewport({ scale: 1 })
        const s = (width / base.width) * scale
        const vp = page.getViewport({ scale: s * (window.devicePixelRatio || 1) })
        const canvas = document.createElement('canvas')
        canvas.width = vp.width
        canvas.height = vp.height
        canvas.style.width = `${(vp.width / (window.devicePixelRatio || 1))}px`
        canvas.className = 'mx-auto mb-3 max-w-none rounded-lg bg-white shadow-sm'
        container.appendChild(canvas)
        await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport: vp } as any).promise
      }
      if (!cancelled && onFullyViewed) {
        const last = container.lastElementChild
        if (last) {
          const io = new IntersectionObserver((ents) => {
            if (ents.some((e) => e.isIntersecting)) { onFullyViewed(); io.disconnect() }
          })
          io.observe(last)
        }
      }
    }
    void render()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, scale])

  if (error) return <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{t('mat.pdfError')}: {error}</p>
  return (
    <div className="rounded-2xl border border-line bg-slate-100">
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2 text-xs text-muted">
        <span>{doc ? t('mat.pages', { n: doc.numPages }) : t('common.loading')}</span>
        <div className="flex gap-1">
          <Button size="icon-sm" variant="ghost" onClick={() => setScale((s) => Math.max(0.6, s - 0.2))} aria-label={t('mat.zoomOut')}><ZoomOut /></Button>
          <Button size="icon-sm" variant="ghost" onClick={() => setScale((s) => Math.min(2.4, s + 0.2))} aria-label={t('mat.zoomIn')}><ZoomIn /></Button>
        </div>
      </div>
      <div className="max-h-[75vh] overflow-auto p-3" data-testid="pdf-pages">
        {!doc && <div className="flex justify-center py-10"><Spinner /></div>}
        <div ref={box} />
      </div>
    </div>
  )
}
