/* Демо-видео №2: сотрудник на смартфоне (390×844), офлайн-обучение и синхронизация. */
import { expect, test, type Page } from '@playwright/test'
import { caption, DEMO_COURSE, DEMO_QUESTIONS, installOverlay, login, pause, scrollThrough } from './helpers'

test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: false,
           video: { mode: 'on', size: { width: 390, height: 844 } } })

async function answerAll(page: Page) {
  for (let i = 0; i < DEMO_QUESTIONS.length; i++) {
    const text = (await page.getByTestId('question-text').innerText()).trim()
    const q = DEMO_QUESTIONS.find((x) => x.text === text)!
    await pause(page, 900)
    if (q.type === 'ordering') {
      const desired = q.options.map((o) => o[0])
      for (let pos = 0; pos < desired.length; pos++) {
        for (;;) {
          const rows = page.locator('div.flex.items-center.gap-3.rounded-2xl', { has: page.getByRole('button', { name: 'Выше' }) })
          const texts = await rows.locator('span.flex-1').allInnerTexts()
          const at = texts.indexOf(desired[pos])
          if (at <= pos) break
          await rows.nth(at).getByRole('button', { name: 'Выше' }).click()
          await pause(page, 400)
        }
      }
    } else {
      for (const [label, ok] of q.options) if (ok) { await page.getByTestId('option').filter({ hasText: label }).first().click(); await pause(page, 400) }
    }
    await pause(page, 600)
    if (i < DEMO_QUESTIONS.length - 1) await page.getByTestId('next-question').click()
  }
}

test('Сотрудник: скачивание курса, обучение без сети, синхронизация, результаты', async ({ page, context }) => {
  test.setTimeout(600_000)
  await installOverlay(context)
  await page.goto('/login')
  await caption(page, 'Dolce Learn на смартфоне сотрудника. Приложение устанавливается на экран «Домой» (PWA)', 2800)
  await caption(page, 'Интерфейс на трёх языках: русский, қазақша, English', 1500)
  await page.locator('[data-lang=kk]').click()
  await pause(page, 1500)
  await page.locator('[data-lang=en]').click()
  await pause(page, 1500)
  await page.locator('[data-lang=ru]').click()
  await login(page, 'employee@dolce.local')
  await expect(page.getByText('Общий прогресс')).toBeVisible()
  await page.waitForFunction(() => !!navigator.serviceWorker?.controller, null, { timeout: 30_000 })

  await caption(page, 'Главная: общий прогресс, курс для продолжения, сроки, результаты и сертификаты', 3000)
  await scrollThrough(page, 1200, 8)
  await page.mouse.wheel(0, -3000)

  await page.getByRole('link', { name: 'Мои курсы' }).first().click()
  await caption(page, 'Назначенный методистом курс уже здесь', 2200)
  await page.getByText(DEMO_COURSE, { exact: true }).first().click()
  await caption(page, 'Страница курса: программа, прогресс и кнопка скачивания с размером', 2500)
  await scrollThrough(page, 500, 4)
  await page.getByTestId('download-course').scrollIntoViewIfNeeded()
  await page.getByTestId('download-course').click()
  await caption(page, 'Скачиваем курс для офлайн-доступа: видео, PDF и тест сохраняются на телефоне', 1500)
  await expect(page.getByText(/Доступен офлайн/)).toBeVisible({ timeout: 60_000 })
  await caption(page, 'Курс скачан — можно идти в цех, где нет Wi-Fi', 2200)

  // ---------- Обрыв связи ----------
  await context.setOffline(true)
  await page.reload()
  await caption(page, '✈️ Связь отключена (авиарежим). Приложение открывается с устройства, в шапке — «Офлайн»', 3200)
  await page.getByTestId('start-course').scrollIntoViewIfNeeded()
  await page.getByTestId('start-course').click()
  await caption(page, 'Видео воспроизводится с памяти телефона', 1500)
  await page.evaluate(async () => {
    const v = document.querySelector('video') as HTMLVideoElement
    v.muted = true
    await v.play()
  })
  await pause(page, 3500)
  await page.evaluate(() => { const v = document.querySelector('video') as HTMLVideoElement; v.currentTime = 15 })
  await caption(page, 'Перемотка работает без сети', 2500)
  await page.evaluate(() => (document.querySelector('video') as HTMLVideoElement).pause())
  await page.getByTestId('next-lesson').scrollIntoViewIfNeeded()
  await page.getByTestId('next-lesson').click()
  await expect(page.locator('[data-testid=pdf-pages] canvas').first()).toBeVisible({ timeout: 20_000 })
  await caption(page, 'PDF-инструкция открывается внутри приложения — тоже без интернета', 3000)
  await scrollThrough(page, 600, 4)
  await page.getByTestId('next-lesson').scrollIntoViewIfNeeded()
  await page.getByTestId('next-lesson').click()

  await page.getByTestId('open-test').click()
  await caption(page, 'Итоговый тест — офлайн. Правильные ответы на телефон не передаются', 2600)
  await page.getByTestId('begin-test').click()
  await answerAll(page)
  page.once('dialog', (d) => d.accept())
  await page.getByTestId('finish-test').click()
  await expect(page.getByTestId('attempt-pending')).toBeVisible()
  await caption(page, 'Ответы сохранены на устройстве и ждут отправки. Результат рассчитает сервер', 3200)
  await page.getByTestId('sync-button').click()
  await caption(page, 'Очередь синхронизации: события ждут появления связи', 3200)
  await page.keyboard.press('Escape')

  // ---------- Связь восстановлена ----------
  await context.setOffline(false)
  await caption(page, '📶 Связь восстановлена — синхронизация запускается автоматически', 1200)
  await expect(page.getByText('Тест сдан!')).toBeVisible({ timeout: 45_000 })
  await caption(page, 'Сервер подтвердил результат: «Тест сдан», отметка «Пройден офлайн»', 3200)
  await scrollThrough(page, 1400, 8)
  await caption(page, 'Разбор ответов с правильными вариантами — только после завершения попытки', 2500)

  await page.getByRole('button', { name: 'Ещё' }).click()
  await page.getByRole('link', { name: 'Сертификаты' }).click()
  await caption(page, 'PDF-сертификат выдан автоматически после завершения курса', 3000)
  await page.getByRole('button', { name: 'Ещё' }).click()
  await page.getByRole('link', { name: 'Мои результаты' }).click()
  await caption(page, 'История попыток и средний балл', 2500)
  await page.getByRole('button', { name: 'Ещё' }).click()
  await page.getByRole('link', { name: 'Офлайн-доступ' }).click()
  await caption(page, 'Управление памятью: скачанные курсы, занятое место, удаление с устройства', 3000)
  await page.getByRole('link', { name: 'Библиотека' }).first().click()
  await caption(page, 'Библиотека документов — файлы можно сохранить для офлайн-доступа', 2800)
  const sheet = page.locator('div.fixed.inset-0.z-40')
  await page.getByRole('button', { name: 'Ещё' }).click()
  await caption(page, 'Смена языка — в меню', 1200)
  await sheet.locator('[data-lang=kk]').click()
  await pause(page, 1500)
  await sheet.getByRole('link', { name: 'Басты бет' }).click()
  await caption(page, 'Қазақша интерфейс — выбор языка сохраняется в профиле', 3500)
  await page.getByRole('button', { name: 'Тағы' }).click()
  await sheet.locator('[data-lang=ru]').click()
  await sheet.getByRole('link', { name: 'Главная' }).click()
  await caption(page, 'Dolce Learn: обучение и аттестация персонала — даже без интернета', 3500)
})
