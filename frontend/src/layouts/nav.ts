import {
  Award, BarChart3, BookOpen, Building2, ClipboardCheck, ClipboardList, CloudDownload, FileCheck2, FolderOpen,
  GraduationCap, Home, LayoutGrid, Library, ListChecks, MessagesSquare, PlusCircle, Settings, Target, Trophy, User,
  Users,
} from 'lucide-react'
import type { Role } from '@/types'
import type { TKey } from '@/i18n'

export interface NavItem {
  to: string
  label: TKey
  icon: React.ComponentType<{ className?: string }>
  end?: boolean
  mobile?: boolean // показывать в нижней панели
}
export interface NavGroup { title?: string; items: NavItem[] }

const learnerItems: NavItem[] = [
  { to: '/courses', label: 'nav.myCourses', icon: BookOpen, mobile: true },
  { to: '/catalog', label: 'nav.catalog', icon: LayoutGrid },
  { to: '/library', label: 'nav.library', icon: Library, mobile: true },
  { to: '/tests', label: 'nav.tests', icon: ListChecks, mobile: true },
  { to: '/results', label: 'nav.results', icon: Trophy },
  { to: '/certificates', label: 'nav.certificates', icon: Award },
  { to: '/offline', label: 'nav.offline', icon: CloudDownload },
  { to: '/assessments', label: 'nav.assessments', icon: Target },
]

export function navFor(role: Role): NavGroup[] {
  if (role === 'employee') {
    return [{ items: [{ to: '/', label: 'nav.home', icon: Home, end: true, mobile: true }, ...learnerItems,
                      { to: '/profile', label: 'nav.profile', icon: User }] }]
  }
  if (role === 'manager') {
    return [
      { title: 'Подразделение', items: [
        { to: '/', label: 'nav.home', icon: Home, end: true, mobile: true },
        { to: '/admin/employees', label: 'nav.employees', icon: Users, mobile: true },
        { to: '/admin/assignments', label: 'nav.assignments', icon: ClipboardList },
        { to: '/admin/analytics', label: 'nav.analytics', icon: BarChart3, mobile: true },
        { to: '/admin/competencies', label: 'nav.competencies', icon: Target },
        { to: '/admin/documents', label: 'nav.documents', icon: FileCheck2 },
      ] },
      { title: 'Моё обучение', items: [...learnerItems.map((i) => ({ ...i, mobile: i.to === '/courses' })),
                                        { to: '/profile', label: 'nav.profile', icon: User }] },
    ]
  }
  return [
    { items: [
      { to: '/', label: 'nav.home', icon: Home, end: true, mobile: true },
      { to: '/admin/courses', label: 'nav.courses', icon: GraduationCap, end: true, mobile: true },
      { to: '/admin/courses/new', label: 'nav.createCourse', icon: PlusCircle },
      { to: '/admin/library', label: 'nav.library', icon: FolderOpen },
      { to: '/admin/tests', label: 'nav.testBuilder', icon: ListChecks, mobile: true },
      { to: '/admin/employees', label: 'nav.employees', icon: Users },
      { to: '/admin/departments', label: 'nav.departments', icon: Building2 },
      { to: '/admin/assignments', label: 'nav.assignments', icon: ClipboardList },
      { to: '/admin/analytics', label: 'nav.analytics', icon: BarChart3, mobile: true },
      { to: '/admin/competencies', label: 'nav.competencies', icon: Target },
      { to: '/admin/documents', label: 'nav.documents', icon: FileCheck2 },
      { to: '/admin/settings', label: 'nav.settings', icon: Settings },
    ] },
    { title: 'Инструменты', items: [
      { to: '/admin/review', label: 'nav.review', icon: ClipboardCheck },
      { to: '/admin/dialogues', label: 'nav.dialogues', icon: MessagesSquare },
    ] },
  ]
}
