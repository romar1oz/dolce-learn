/* Минимальная i18n-архитектура. ru — исходный язык; kk/en — заготовки (недостающие ключи берутся из ru).
   Чтобы добавить перевод, заполните словарь и выберите язык в профиле (поле locale пользователя). */
import { useAuth } from '@/stores/auth'

const ru = {
  'nav.home': 'Главная',
  'nav.myCourses': 'Мои курсы',
  'nav.catalog': 'Каталог курсов',
  'nav.library': 'Библиотека',
  'nav.tests': 'Тесты',
  'nav.results': 'Мои результаты',
  'nav.certificates': 'Сертификаты',
  'nav.profile': 'Профиль',
  'nav.courses': 'Мои курсы',
  'nav.createCourse': 'Создать курс',
  'nav.testBuilder': 'Конструктор тестов',
  'nav.employees': 'Сотрудники',
  'nav.departments': 'Подразделения',
  'nav.assignments': 'Назначения',
  'nav.analytics': 'Аналитика',
  'nav.competencies': 'Компетенции 180/360',
  'nav.documents': 'Сертификаты и протоколы',
  'nav.settings': 'Настройки',
  'nav.dialogues': 'Тренажёр диалогов',
  'nav.review': 'Проверка ответов',
  'nav.offline': 'Офлайн-доступ',
  'nav.more': 'Ещё',
  'nav.learning': 'Моё обучение',
  'nav.assessments': 'Мои оценки 360',
  'common.logout': 'Выйти',
  'common.online': 'В сети',
  'common.offline': 'Нет сети',
  'common.sync': 'Синхронизация',
}

type Dict = Partial<Record<keyof typeof ru, string>>

const kk: Dict = {
  'nav.home': 'Басты бет',
  'nav.myCourses': 'Менің курстарым',
  'nav.library': 'Кітапхана',
  'nav.tests': 'Тесттер',
  'nav.profile': 'Профиль',
  'common.logout': 'Шығу',
}

const en: Dict = {
  'nav.home': 'Home',
  'nav.myCourses': 'My courses',
  'nav.catalog': 'Catalog',
  'nav.library': 'Library',
  'nav.tests': 'Tests',
  'nav.results': 'My results',
  'nav.certificates': 'Certificates',
  'nav.profile': 'Profile',
  'common.logout': 'Log out',
}

const dicts: Record<string, Dict> = { ru, kk, en }
export type TKey = keyof typeof ru

export function translate(locale: string, key: TKey): string {
  return dicts[locale]?.[key] ?? ru[key] ?? key
}

export function useT() {
  const locale = useAuth((s) => s.user?.locale || 'ru')
  return (key: TKey) => translate(locale, key)
}
