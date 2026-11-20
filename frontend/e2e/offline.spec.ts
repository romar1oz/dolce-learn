/* Ключевой сценарий Dolce Learn (раздел 21 ТЗ), проверяемый в настоящем Chromium с Service Worker:
   методист создаёт курс (видео + PDF + тест из 5 вопросов) → назначает → сотрудник скачивает курс →
   сеть ОТКЛЮЧАЕТСЯ → видео, PDF и тест открываются и проходятся офлайн → сеть включается →
   синхронизация → сервер оценил попытку, курс завершён, сертификат выдан, повторная отправка не дублирует. */
import { expect, request as pwRequest, test, type APIRequestContext, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const PASSWORD = 'DolceDemo2026!'
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const VIDEO = readFileSync(path.join(ROOT, 'backend/app/assets/demo/demo_test_video.mp4'))

function tinyPdf(lines: string[]): Buffer {
  const content = 'BT /F1 16 Tf 60 780 Td ' + lines.map((l, i) => (i ? '0 -26 Td ' : '') + `(${l}) Tj`).join(' ') + ' ET'
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

async function apiAs(baseURL: string, email: string): Promise<APIRequestContext> {
  const ctx = await pwRequest.newContext({ baseURL })
  const r = await ctx.post('/api/auth/login', { data: { email, password: PASSWORD } })
  expect(r.ok()).toBeTruthy()
  const token = (await r.json()).access_token
  await ctx.dispose()
  return pwRequest.newContext({ baseURL, extraHTTPHeaders: { Authorization: `Bearer ${token}` } })
}

const QUESTIONS = [
  { type: 'single', text: 'Что сделать при неисправности оборудования?', options: [['Сообщить мастеру', true], ['Починить самому', false], ['Работать дальше', false]] },
  { type: 'multiple', text: 'Какие СИЗ обязательны?', options: [['Перчатки', true], ['Маска', true], ['Наушники', false]] },
  { type: 'single', text: 'Номер скорой помощи?', options: [['101', false], ['103', true]] },
  { type: 'ordering', text: 'Порядок действий при аварии', options: [['Нажать аварийную кнопку', false], ['Сообщить мастеру смены', false], ['Оказать первую помощь', false]] },
  { type: 'single', text: 'Можно ли снимать ограждение?', options: [['Да', false], ['Нет', true]] },
] as const

async function answerCorrectly(page: Page) {
  for (let i = 0; i < QUESTIONS.length; i++) {
    const text = (await page.getByTestId('question-text').innerText()).trim()
    const q = QUESTIONS.find((x) => x.text === text)!
    if (q.type === 'ordering') {
      const desired = q.options.map((o) => o[0])
      for (let pos = 0; pos < desired.length; pos++) {
        for (;;) {
          const rows = page.locator('div.flex.items-center.gap-3.rounded-2xl', { has: page.getByRole('button', { name: 'Выше' }) })
          const texts = await rows.locator('span.flex-1').allInnerTexts()
          const at = texts.indexOf(desired[pos])
          if (at <= pos) break
          await rows.nth(at).getByRole('button', { name: 'Выше' }).click()
        }
      }
    } else {
      for (const [label, ok] of q.options) if (ok) await page.getByTestId('option').filter({ hasText: label }).first().click()
    }
    if (i < QUESTIONS.length - 1) await page.getByTestId('next-question').click()
  }
}

test('офлайн-обучение: скачать курс, пройти без сети, синхронизировать', async ({ page, context, baseURL }) => {
  // ---------- 1–8. Методист готовит и назначает курс ----------
  const staff = await apiAs(baseURL!, 'methodist@dolce.local')
  const up = async (name: string, mime: string, buffer: Buffer, extra: Record<string, string> = {}) => {
    const r = await staff.post('/api/materials/upload', { multipart: { file: { name, mimeType: mime, buffer }, ...extra } })
    expect(r.status(), await r.text()).toBe(201)
    return r.json()
  }
  const video = await up('siz.mp4', 'video/mp4', VIDEO, { title: 'Тестовое видео СИЗ', duration_sec: '24' })
  const pdf = await up('instr.pdf', 'application/pdf', tinyPdf(['Safety instruction (E2E test document)', '1. Use PPE.', '2. Stop machine on alarm.']))
  const course = await (await staff.post('/api/courses', { data: { title: 'Техника безопасности на производстве', description: 'E2E', pass_score: 80, due_days: 7 } })).json()
  const mod = await (await staff.post(`/api/courses/${course.id}/modules`, { data: { title: 'Модуль 1' } })).json()
  const l1 = await (await staff.post(`/api/modules/${mod.id}/lessons`, { data: { title: 'Видео: СИЗ' } })).json()
  const l2 = await (await staff.post(`/api/modules/${mod.id}/lessons`, { data: { title: 'PDF-инструкция' } })).json()
  const l3 = await (await staff.post(`/api/modules/${mod.id}/lessons`, { data: { title: 'Итоговый тест' } })).json()
  expect((await staff.post(`/api/lessons/${l1.id}/materials`, { data: { kind: 'video', media_id: video.id, title: 'Видео' } })).status()).toBe(201)
  expect((await staff.post(`/api/lessons/${l2.id}/materials`, { data: { kind: 'pdf', media_id: pdf.id, title: 'Инструкция' } })).status()).toBe(201)
  const t = await (await staff.post('/api/tests', { data: { title: 'Итоговый тест ТБ', course_id: course.id, pass_score: 80, max_attempts: 3 } })).json()
  for (const q of QUESTIONS) {
    const r = await staff.post(`/api/tests/${t.id}/questions`, { data: { type: q.type, text: q.text, options: q.options.map(([text, is_correct]) => ({ text, is_correct })) } })
    expect(r.status(), await r.text()).toBe(201)
  }
  expect((await staff.patch(`/api/tests/${t.id}`, { data: { status: 'published' } })).ok()).toBeTruthy()
  expect((await staff.post(`/api/lessons/${l3.id}/materials`, { data: { kind: 'test', test_id: t.id, title: 'Тест' } })).status()).toBe(201)
  expect((await staff.patch(`/api/courses/${course.id}`, { data: { status: 'published' } })).ok()).toBeTruthy()
  const users = await (await staff.get('/api/users', { params: { q: 'employee@dolce.local' } })).json()
  const employeeId = users.items[0].id
  expect((await staff.post('/api/assignments', { data: { course_id: course.id, user_ids: [employeeId] } })).status()).toBe(201)

  // ---------- 9–11. Сотрудник входит, видит курс, скачивает ----------
  await page.goto('/login')
  await page.getByPlaceholder('name@dolce.local').fill('employee@dolce.local')
  await page.locator('input[type=password]').fill(PASSWORD)
  await page.getByRole('button', { name: 'Войти' }).click()
  await expect(page.getByText('Общий прогресс')).toBeVisible()
  await page.waitForFunction(() => !!navigator.serviceWorker?.controller, null, { timeout: 30_000 })
  await page.goto('/courses')
  await page.getByText('Техника безопасности на производстве').first().click()
  await page.getByTestId('download-course').click()
  await expect(page.getByText(/Доступен офлайн/)).toBeVisible({ timeout: 60_000 })
  const cached = await page.evaluate(async () => (await (await caches.open('dolce-media-v1')).keys()).length)
  expect(cached).toBeGreaterThanOrEqual(2)

  // ---------- 12. Авиарежим ----------
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByText(/Офлайн-режим: доступны скачанные курсы/)).toBeVisible()
  await expect(page.getByText('Техника безопасности на производстве').first()).toBeVisible()

  // ---------- 13. Видео и PDF без сети ----------
  await page.getByTestId('start-course').click()
  const vid = page.getByTestId('lesson-video')
  await expect(vid).toBeVisible()
  expect(await vid.getAttribute('src')).toMatch(/^blob:/)
  await page.waitForFunction(() => {
    const v = document.querySelector('video') as HTMLVideoElement
    return v && v.readyState >= 1 && v.duration > 1
  })
  await page.evaluate(async () => { const v = document.querySelector('video')!; v.muted = true; await v.play(); await new Promise((r) => setTimeout(r, 2500)); v.pause() })
  await expect(page.getByText('Воспроизводится с устройства')).toBeVisible()
  await page.mouse.move(10, 10)
  await page.getByTestId('next-lesson').click()
  await expect(page.locator('[data-testid=pdf-pages] canvas').first()).toBeVisible({ timeout: 20_000 })
  await page.mouse.move(20, 20)
  await page.getByTestId('next-lesson').click()

  // ---------- 14–15. Тест без сети, ответы сохраняются локально ----------
  await page.getByTestId('open-test').click()
  await page.getByTestId('begin-test').click()
  await answerCorrectly(page)
  page.once('dialog', (d) => d.accept())
  await page.getByTestId('finish-test').click()
  await expect(page.getByTestId('attempt-pending')).toBeVisible()
  const pending = Number(await page.getByTestId('pending-badge').innerText())
  expect(pending).toBeGreaterThan(0)
  const serverBefore = await (await staff.get('/api/attempts', { params: { test_id: t.id } })).json()
  expect(serverBefore.total).toBe(0) // сервер ещё ничего не знает

  // ---------- 16–17. Сеть вернулась → автоматическая синхронизация ----------
  await context.setOffline(false)
  await expect(page.getByText('Тест сдан!')).toBeVisible({ timeout: 45_000 })
  await expect(page.getByText('Пройден офлайн')).toBeVisible()

  // ---------- 18–19. Методист видит результат, завершение и время ----------
  const attempts = await (await staff.get('/api/attempts', { params: { test_id: t.id } })).json()
  expect(attempts.total).toBe(1)
  expect(attempts.items[0]).toMatchObject({ source: 'offline', passed: true, percent: 100, user_id: employeeId })
  const report = await (await staff.get('/api/analytics/report', { params: { course_id: course.id } })).json()
  expect(report.items[0]).toMatchObject({ status: 'completed', best_score: 100, result: 'Сдал', has_offline: true })
  const detail = await (await staff.get(`/api/analytics/users/${employeeId}`)).json()
  const lessonSeconds = detail.lessons.filter((l: any) => l.course_title === course.title).reduce((s: number, l: any) => s + l.time_spent_sec, 0)
  expect(lessonSeconds).toBeGreaterThan(0)

  // ---------- 21. Повторная отправка тех же событий не создаёт дублей ----------
  const events = await page.evaluate(() => new Promise<any[]>((resolve) => {
    const req = indexedDB.open('dolce-learn')
    req.onsuccess = () => {
      const tx = req.result.transaction('queue', 'readonly')
      const all = tx.objectStore('queue').getAll()
      all.onsuccess = () => resolve(all.result.filter((e: any) => e.status === 'synced'))
    }
  }))
  expect(events.some((e) => e.type === 'test_attempt')).toBeTruthy()
  const emp = await apiAs(baseURL!, 'employee@dolce.local')
  const replay = await (await emp.post('/api/sync/batch', { data: { device_id: 'e2e-replay', events: events.map((e) => ({ id: e.id, type: e.type, client_ts: e.client_ts, offline: true, payload: e.payload })) } })).json()
  expect(replay.results.every((r: any) => r.status === 'duplicate')).toBeTruthy()
  expect((await (await staff.get('/api/attempts', { params: { test_id: t.id } })).json()).total).toBe(1)

  // ---------- 20. Сертификат и протокол формируются на сервере ----------
  const certs = await (await emp.get('/api/certificates')).json()
  const cert = certs.find((c: any) => c.course_id === course.id)
  expect(cert).toBeTruthy()
  const certPdf = await emp.get(`/api/certificates/${cert.id}/pdf`)
  expect((await certPdf.body()).subarray(0, 4).toString()).toBe('%PDF')
  const prot = await (await staff.post('/api/reports/protocols', { data: { course_id: course.id } })).json()
  expect(prot.passed).toBe(1)
  expect(((await (await staff.get(`/api/reports/protocols/${prot.id}/pdf`)).body()).subarray(0, 4)).toString()).toBe('%PDF')
  await page.screenshot({ path: 'e2e-result.png', fullPage: true })
})
