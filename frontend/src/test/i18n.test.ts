import { describe, expect, it } from 'vitest'
import { ru } from '@/i18n/ru'
import { kk } from '@/i18n/kk'
import { en } from '@/i18n/en'
import { pluralize, translate, useLocale } from '@/i18n'
import { fmtBytes, fmtDuration } from '@/lib/utils'

const params = (s: string) => (s.match(/\{\w+\}/g) || []).sort().join(',')

describe('переводы', () => {
  it('во всех языках одинаковый набор ключей и непустые строки', () => {
    for (const dict of [kk, en]) {
      expect(Object.keys(dict).sort()).toEqual(Object.keys(ru).sort())
      for (const v of Object.values(dict)) expect(v.trim().length).toBeGreaterThan(0)
    }
  })
  it('подстановки {…} совпадают с русским оригиналом', () => {
    for (const [k, v] of Object.entries(ru)) {
      expect(params(kk[k as keyof typeof kk]), `kk ${k}`).toBe(params(v))
      expect(params(en[k as keyof typeof en]), `en ${k}`).toBe(params(v))
    }
  })
  it('множественное число и подстановки', () => {
    expect(pluralize('ru', ru['pl.lesson'], 5)).toBe('уроков')
    expect(pluralize('en', en['pl.lesson'], 1)).toBe('lesson')
    expect(pluralize('kk', kk['pl.lesson'], 7)).toBe('сабақ')
    expect(translate('kk', 'test.questionOf', { n: 2, total: 5 })).toBe('5 сұрақтың 2-сі')
  })
  it('форматирование следует выбранному языку', () => {
    useLocale.getState().setLocale('en')
    expect(fmtBytes(5 * 1024 * 1024)).toBe('5.0 MB')
    expect(fmtDuration(3900)).toBe('1 h 5 min')
    useLocale.getState().setLocale('kk')
    expect(fmtDuration(3900)).toBe('1 сағ 5 мин')
    useLocale.getState().setLocale('ru')
  })
})
