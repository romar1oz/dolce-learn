import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { RichText } from '@/components/RichText'
import { fmtBytes, fmtDuration, plural, daysUntil } from '@/lib/utils'
import { translate } from '@/i18n'

describe('RichText (защита от XSS)', () => {
  it('не интерпретирует HTML и скрипты', () => {
    const html = renderToStaticMarkup(<RichText text={'<img src=x onerror=alert(1)> <script>alert(1)</script>'} />)
    expect(html).not.toContain('<img')
    expect(html).not.toContain('<script')
    expect(html).toContain('&lt;script&gt;')
  })
  it('поддерживает жирный текст и списки', () => {
    const html = renderToStaticMarkup(<RichText text={'**Важно**\n- пункт 1\n- пункт 2\n1. шаг'} />)
    expect(html).toContain('<strong>Важно</strong>')
    expect(html).toContain('<ul><li>пункт 1</li><li>пункт 2</li></ul>')
    expect(html).toContain('<ol><li>шаг</li></ol>')
  })
})

describe('утилиты форматирования', () => {
  it('размер, длительность, склонения', () => {
    expect(fmtBytes(1536)).toBe('2 КБ')
    expect(fmtBytes(5 * 1024 * 1024)).toBe('5.0 МБ')
    expect(fmtDuration(3900)).toBe('1 ч 5 мин')
    expect(plural(1, 'урок', 'урока', 'уроков')).toBe('урок')
    expect(plural(3, 'урок', 'урока', 'уроков')).toBe('урока')
    expect(plural(11, 'урок', 'урока', 'уроков')).toBe('уроков')
    const today = new Date().toISOString().slice(0, 10)
    expect(daysUntil(today)).toBe(0)
  })
  it('i18n: fallback на русский', () => {
    expect(translate('en', 'nav.home')).toBe('Home')
    expect(translate('kk', 'nav.analytics')).toBe('Аналитика')
  })
})
