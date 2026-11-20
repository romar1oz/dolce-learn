/* Вспомогательные функции для записи демо-видео: подписи к шагам и видимый курсор. */
import type { BrowserContext, Page } from '@playwright/test'

export const PASSWORD = 'DolceDemo2026!'

/** Скрипт, который на каждой странице рисует подпись (из localStorage) и курсор-«точку». */
export async function installOverlay(context: BrowserContext) {
  await context.addInitScript(() => {
    const render = () => {
      if (!document.body) return
      let cap = document.getElementById('__demo_caption')
      if (!cap) {
        cap = document.createElement('div')
        cap.id = '__demo_caption'
        cap.setAttribute('style', 'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:2147483647;'
          + 'max-width:min(92vw,880px);padding:10px 18px;border-radius:14px;background:rgba(4,56,43,.94);color:#fff;'
          + 'font:600 15px/1.35 "Inter Variable",system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.25);text-align:center;'
          + 'pointer-events:none;transition:opacity .25s')
        document.body.appendChild(cap)
      }
      const text = localStorage.getItem('__demo_caption') || ''
      cap.textContent = text
      cap.style.opacity = text ? '1' : '0'
      let dot = document.getElementById('__demo_cursor')
      if (!dot) {
        dot = document.createElement('div')
        dot.id = '__demo_cursor'
        dot.setAttribute('style', 'position:fixed;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;'
          + 'background:rgba(16,185,129,.35);border:2px solid #10B981;z-index:2147483647;pointer-events:none;'
          + 'transition:transform .12s;left:-50px;top:-50px')
        document.body.appendChild(dot)
        document.addEventListener('mousemove', (e) => { dot!.style.left = e.clientX + 'px'; dot!.style.top = e.clientY + 'px' }, true)
        document.addEventListener('mousedown', () => { dot!.style.transform = 'scale(.7)' }, true)
        document.addEventListener('mouseup', () => { dot!.style.transform = 'scale(1)' }, true)
      }
    }
    document.addEventListener('DOMContentLoaded', render)
    window.addEventListener('storage', render)
    ;(window as any).__renderDemo = render
    setInterval(render, 500)
  })
}

export async function caption(page: Page, text: string, holdMs = 1800) {
  await page.evaluate((t) => {
    localStorage.setItem('__demo_caption', t)
    ;(window as any).__renderDemo?.()
  }, text)
  await page.waitForTimeout(holdMs)
}

export async function pause(page: Page, ms = 1200) {
  await page.waitForTimeout(ms)
}

/** Плавная прокрутка страницы, чтобы зритель успел рассмотреть содержимое. */
export async function scrollThrough(page: Page, px = 900, steps = 6) {
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, px / steps)
    await page.waitForTimeout(350)
  }
}

export async function login(page: Page, email: string) {
  await page.goto('/login')
  await page.getByPlaceholder('name@dolce.local').click()
  await page.getByPlaceholder('name@dolce.local').pressSequentially(email, { delay: 35 })
  await page.locator('input[type=password]').click()
  await page.locator('input[type=password]').pressSequentially(PASSWORD, { delay: 35 })
  await page.locator('button[type=submit]').click()
}

export function tinyPdf(lines: string[]): Buffer {
  const content = 'BT /F1 18 Tf 60 780 Td ' + lines.map((l, i) => (i ? '0 -30 Td ' : '') + `(${l}) Tj`).join(' ') + ' ET'
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']
  let out = '%PDF-1.4\n'
  const offs: number[] = []
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n` })
  const xref = out.length
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return Buffer.from(out, 'latin1')
}

export const DEMO_COURSE = 'Техника безопасности на производстве'
export const DEMO_QUESTIONS = [
  { type: 'single', text: 'Что сделать при неисправности оборудования перед сменой?',
    options: [['Сообщить мастеру и не начинать работу', true], ['Починить самостоятельно', false], ['Продолжить работу', false]] },
  { type: 'multiple', text: 'Какие СИЗ обязательны в цехе?',
    options: [['Перчатки', true], ['Маска', true], ['Наушники для музыки', false]] },
  { type: 'ordering', text: 'Расставьте действия при аварии по порядку',
    options: [['Нажать аварийную кнопку', false], ['Сообщить мастеру смены', false], ['Оказать первую помощь', false]] },
] as const
