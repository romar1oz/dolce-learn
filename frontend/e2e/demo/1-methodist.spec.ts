/* Демо-видео №1: кабинет методиста (компьютер, 1440×900). */
import { expect, test } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { caption, DEMO_COURSE, DEMO_QUESTIONS, installOverlay, login, pause, scrollThrough, tinyPdf } from './helpers'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const ASSETS = path.join(ROOT, 'backend/app/assets/demo')

test.use({ viewport: { width: 1440, height: 900 }, video: { mode: 'on', size: { width: 1440, height: 900 } } })

test('Методист: создание курса, теста, назначение, аналитика и документы', async ({ page, context }) => {
  test.setTimeout(600_000)
  await installOverlay(context)
  await page.goto('/login')
  await caption(page, 'Dolce Learn — кабинет методиста. Вход под учётной записью methodist@dolce.local', 2500)
  await login(page, 'methodist@dolce.local')
  await expect(page.getByText('Кабинет методиста')).toBeVisible()

  // ---------- Дашборд ----------
  await caption(page, 'Главная: сотрудники, курсы, % завершения, просрочки, средний балл и часы обучения', 3000)
  await scrollThrough(page, 700)
  await caption(page, 'Графики: активное время обучения по дням, статусы назначений, завершения по неделям и подразделениям', 3000)
  await scrollThrough(page, 900)
  await caption(page, 'Лента последней активности — включая синхронизацию офлайн-результатов', 2500)
  await page.mouse.wheel(0, -3000)

  // ---------- Создание курса ----------
  await page.getByRole('link', { name: 'Создать курс' }).first().click()
  await caption(page, 'Конструктор курса: название, описание, обложка, категория, сроки, проходной балл', 2500)
  await page.getByTestId('course-title').pressSequentially(DEMO_COURSE, { delay: 25 })
  await page.locator('textarea').first().pressSequentially('Базовый курс для операторов: СИЗ, опасные факторы, действия при аварии.', { delay: 10 })
  await page.getByTestId('file-input-image').setInputFiles(path.join(ASSETS, 'cover_safety.png'))
  await expect(page.getByRole('button', { name: 'Заменить' })).toBeVisible()
  await page.locator('select').nth(0).selectOption({ label: 'Охрана труда' })
  await caption(page, 'Обложка загружена перетаскиванием или выбором файла. Сохраняем курс', 2000)
  await page.getByTestId('save-course').click()
  await expect(page.getByTestId('new-module-input')).toBeVisible()

  await caption(page, 'Структура: модули → уроки → элементы (12 типов: текст, видео, PDF, Word, Excel, тест, тренажёр…)', 2500)
  await page.getByTestId('new-module-input').pressSequentially('Основы безопасности', { delay: 25 })
  await page.getByTestId('new-module-input').press('Enter')
  for (const name of ['Видео: средства защиты', 'Инструкция по ТБ (PDF)', 'Итоговый тест']) {
    await page.getByTestId('new-lesson-input').pressSequentially(name, { delay: 20 })
    await page.getByTestId('new-lesson-input').press('Enter')
    await pause(page, 700)
  }

  // видео
  await page.getByRole('button', { name: /^1\. Видео: средства защиты/ }).click()
  await page.getByTestId('add-block').first().click()
  await caption(page, 'Добавляем видео: MP4/WebM/MOV, прогресс загрузки, автоматическая длительность и кадр-превью', 2500)
  await page.getByTestId('block-video').click()
  await page.getByTestId('file-input-video').setInputFiles(path.join(ASSETS, 'demo_test_video.mp4'))
  await expect(page.getByTestId('upload-start')).toBeVisible()
  await pause(page, 1500)
  await page.getByTestId('upload-start').click()
  await expect(page.getByText(/demo_test_video\.mp4 ·/)).toBeVisible({ timeout: 30_000 })
  await page.getByTestId('save-block').click()
  await pause(page)

  // PDF + инструкция
  await page.getByRole('button', { name: /^2\. Инструкция по ТБ/ }).click()
  await page.getByTestId('add-block').nth(1).click()
  await caption(page, 'PDF-инструкция: файл проверяется по содержимому, хранится на локальном сервере', 2200)
  await page.getByTestId('block-pdf').click()
  await page.getByTestId('file-input-pdf').setInputFiles({ name: 'instrukciya_tb.pdf', mimeType: 'application/pdf',
    buffer: tinyPdf(['Safety instruction TB-01 (demo document)', '1. Use PPE: gloves, mask, goggles.', '2. Stop the machine with the emergency button.', '3. Report to the shift master.']) })
  await page.getByTestId('upload-start').click()
  await expect(page.getByText(/instrukciya_tb\.pdf ·/)).toBeVisible({ timeout: 30_000 })
  await page.getByTestId('save-block').click()
  await pause(page)
  await page.getByTestId('add-block').nth(1).click()
  await page.getByTestId('block-instruction').click()
  await page.getByTestId('block-body').pressSequentially('1. Перед сменой проверьте СИЗ.\n2. Не снимайте защитные ограждения.\n3. При аварии нажмите красную кнопку.', { delay: 8 })
  await page.getByTestId('save-block').click()
  await caption(page, 'Порядок элементов и уроков меняется стрелками, всё сохраняется в PostgreSQL', 2200)

  // ---------- Конструктор тестов ----------
  await page.getByRole('link', { name: 'Конструктор тестов' }).click()
  await caption(page, 'Конструктор тестов: одиночный и множественный выбор, открытый ответ, последовательность', 2500)
  await page.getByTestId('new-test').click()
  await page.getByTestId('test-title').pressSequentially('Итоговый тест: техника безопасности', { delay: 20 })
  await page.locator('[role=dialog] select').selectOption({ label: DEMO_COURSE })
  await page.locator('[role=dialog] button[type=submit]').click()
  await expect(page.getByTestId('add-question')).toBeVisible()
  for (const q of DEMO_QUESTIONS) {
    await page.getByTestId('add-question').click()
    await page.getByTestId('q-type').selectOption(q.type)
    await page.getByTestId('q-text').pressSequentially(q.text, { delay: 12 })
    while ((await page.getByTestId('q-option').count()) < q.options.length) await page.getByTestId('add-option').click()
    for (let i = 0; i < q.options.length; i++) await page.getByTestId('q-option').nth(i).fill(q.options[i][0])
    if (q.type !== 'ordering') {
      for (let i = 0; i < q.options.length; i++) {
        const btn = page.getByTestId('q-option').nth(i).locator('xpath=..').getByRole('button', { name: 'Правильный' })
        const on = ((await btn.getAttribute('class')) || '').includes('text-brand-600')
        if (on !== q.options[i][1]) await btn.click()
      }
    }
    await pause(page, 700)
    await page.getByTestId('save-question').click()
    await pause(page, 900)
  }
  await caption(page, 'Настройки: проходной балл, лимит времени, попытки, перемешивание, окно доступности. Публикуем', 2500)
  await page.getByTestId('publish-test').click()
  await pause(page, 1500)

  // ---------- Тест в курс, публикация ----------
  await page.getByRole('link', { name: 'Мои курсы' }).click()
  await page.getByText(DEMO_COURSE).first().click()
  await page.getByRole('button', { name: /^3\. Итоговый тест/ }).click()
  await page.getByTestId('add-block').first().click()
  await page.getByTestId('block-test').click()
  const testOpt = await page.locator('[role=dialog] select option', { hasText: 'Итоговый тест: техника безопасности' }).getAttribute('value')
  await page.locator('[role=dialog] select').selectOption(testOpt!)
  await page.getByTestId('save-block').click()
  await caption(page, 'Тест добавлен в урок. Публикуем курс', 2000)
  await page.getByTestId('publish-course').click()
  await pause(page, 1500)

  // ---------- Назначение ----------
  await page.getByRole('link', { name: 'Назначения' }).click()
  await caption(page, 'Назначение курса сотрудникам или целым подразделениям со сроком прохождения', 2500)
  await page.getByTestId('new-assignment').click()
  await page.getByTestId('assign-course').selectOption({ label: DEMO_COURSE })
  await page.locator('[role=dialog] label', { hasText: 'Ким Дмитрий' }).locator('input').check()
  await pause(page, 800)
  await page.getByTestId('assign-submit').click()
  await pause(page, 2000)

  // ---------- Обзор остальных разделов ----------
  await page.getByRole('link', { name: 'Библиотека' }).click()
  await caption(page, 'Библиотека: документы, СОП и шаблоны с доступом по подразделениям', 2800)
  await page.getByRole('link', { name: 'Сотрудники' }).click()
  await caption(page, 'Сотрудники: роли, подразделения, прогресс обучения и средний балл', 2800)
  await page.getByRole('link', { name: 'Аналитика' }).click()
  await caption(page, 'Аналитика с фильтрами: сотрудник, подразделение, курс, период, статус, результат', 3000)
  await scrollThrough(page, 900)
  await page.getByRole('tab', { name: 'По сотрудникам' }).click()
  await pause(page, 1500)
  await page.getByRole('tab', { name: 'По курсам' }).click()
  await pause(page, 1500)
  await page.mouse.wheel(0, -3000)
  const dl = page.waitForEvent('download')
  await page.getByTestId('export-xlsx').click()
  await dl
  await caption(page, 'Экспорт отчёта в Excel (XLSX) и CSV — для 1С и Битрикс24', 2500)

  await page.getByRole('link', { name: 'Компетенции 180/360' }).click()
  await caption(page, 'Оценка компетенций 180/360: самооценка, руководитель, коллеги', 2200)
  await page.getByRole('button', { name: 'Результаты' }).first().click()
  await caption(page, 'Сводный профиль: радар-диаграмма и сравнение оценок по типам оценивающих', 3500)

  await page.getByRole('link', { name: 'Сертификаты и протоколы' }).click()
  await caption(page, 'PDF-сертификаты выдаются автоматически после завершения курса, протоколы аттестации — по кнопке', 3000)
  await page.getByRole('tab', { name: /Протоколы/ }).click()
  await pause(page, 1800)

  await page.getByRole('link', { name: 'Тренажёр диалогов' }).click()
  await page.getByRole('link', { name: 'Редактировать' }).first().click()
  await caption(page, 'Диалоговый тренажёр: персонажи, реплики, варианты ответа, переходы и баллы — без внешних AI-сервисов', 3500)
  await scrollThrough(page, 700)

  await page.getByRole('link', { name: 'Проверка ответов' }).click()
  await caption(page, 'Ручная проверка открытых ответов в тестах', 2500)
  await page.getByRole('link', { name: 'Главная' }).click()
  await caption(page, 'Готово: курс создан, опубликован и назначен. Дальше — видео от имени сотрудника', 3500)
})
