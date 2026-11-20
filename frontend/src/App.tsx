import { lazy, Suspense, useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from '@/stores/auth'
import { flush, setSyncUser, startAutoSync, useSync } from '@/offline/sync'
import { AppLayout } from '@/layouts/AppLayout'
import { LoadingBlock } from '@/components/ui'
import { LogoMark } from '@/components/Logo'
import LoginPage from '@/pages/auth/LoginPage'
import type { Role } from '@/types'
import { translate, useLocale, useT } from '@/i18n'
import { useProfileLocale } from '@/components/LanguageSwitcher'

const LearnerHome = lazy(() => import('@/pages/learner/LearnerHome'))
const MyCourses = lazy(() => import('@/pages/learner/MyCourses'))
const Catalog = lazy(() => import('@/pages/learner/Catalog'))
const CourseOverview = lazy(() => import('@/pages/learner/CourseOverview'))
const CoursePlayer = lazy(() => import('@/pages/learner/CoursePlayer'))
const LibraryPage = lazy(() => import('@/pages/learner/LibraryPage'))
const TestsPage = lazy(() => import('@/pages/learner/TestsPage'))
const TestTake = lazy(() => import('@/pages/learner/TestTake'))
const AttemptPage = lazy(() => import('@/pages/learner/AttemptPage'))
const ResultsPage = lazy(() => import('@/pages/learner/ResultsPage'))
const CertificatesPage = lazy(() => import('@/pages/learner/CertificatesPage'))
const ProfilePage = lazy(() => import('@/pages/learner/ProfilePage'))
const OfflinePage = lazy(() => import('@/pages/learner/OfflinePage'))
const MyAssessments = lazy(() => import('@/pages/learner/MyAssessments'))
const DialoguePlay = lazy(() => import('@/pages/learner/DialoguePlay'))

const AdminDashboard = lazy(() => import('@/pages/staff/AdminDashboard'))
const StaffCourses = lazy(() => import('@/pages/staff/StaffCourses'))
const CourseEditor = lazy(() => import('@/pages/staff/CourseEditor'))
const StaffLibrary = lazy(() => import('@/pages/staff/StaffLibrary'))
const StaffTests = lazy(() => import('@/pages/staff/StaffTests'))
const TestEditor = lazy(() => import('@/pages/staff/TestEditor'))
const Employees = lazy(() => import('@/pages/staff/Employees'))
const EmployeeDetail = lazy(() => import('@/pages/staff/EmployeeDetail'))
const Departments = lazy(() => import('@/pages/staff/Departments'))
const Assignments = lazy(() => import('@/pages/staff/Assignments'))
const Analytics = lazy(() => import('@/pages/staff/Analytics'))
const Competencies = lazy(() => import('@/pages/staff/Competencies'))
const Documents = lazy(() => import('@/pages/staff/Documents'))
const SettingsPage = lazy(() => import('@/pages/staff/SettingsPage'))
const ReviewPage = lazy(() => import('@/pages/staff/ReviewPage'))
const Dialogues = lazy(() => import('@/pages/staff/Dialogues'))
const DialogueEditor = lazy(() => import('@/pages/staff/DialogueEditor'))

const STAFF: Role[] = ['super_admin', 'methodist']
const MANAGEMENT: Role[] = ['super_admin', 'methodist', 'manager']

function Splash() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-page">
      <LogoMark className="h-14 w-14 animate-pulse" />
      <p className="text-sm text-muted">{translate(useLocale.getState().locale, 'common.appLoading')}</p>
    </div>
  )
}

function Guard({ roles, children }: { roles?: Role[]; children: React.ReactNode }) {
  const { status, user } = useAuth()
  const loc = useLocation()
  const t = useT()
  if (status === 'loading') return <Splash />
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />
  if (roles && !roles.includes(user.role)) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <p className="text-5xl font-bold text-brand-900">403</p>
        <p className="mt-2 font-semibold">{t('common.forbidden')}</p>
        <a href="/" className="mt-4 inline-block text-sm font-semibold text-brand-800 underline">{t('common.toHome')}</a>
      </div>
    )
  }
  return <>{children}</>
}

function Home() {
  const user = useAuth((s) => s.user)
  return user && user.role !== 'employee' ? <AdminDashboard /> : <LearnerHome />
}

export default function App() {
  const { bootstrap, status, user, tryReconnect } = useAuth()
  const online = useSync((s) => s.online)
  const t = useT()
  useProfileLocale()

  useEffect(() => {
    void bootstrap()
    startAutoSync()
  }, [bootstrap])

  useEffect(() => {
    setSyncUser(user?.id ?? null)
    if (status === 'authenticated') void flush()
  }, [user?.id, status])

  // офлайн-сессия → при появлении сети восстанавливаем серверную сессию и отправляем накопленное
  useEffect(() => {
    if (online && status === 'offline') {
      tryReconnect().then((ok) => { if (ok) void flush() })
    }
  }, [online, status, tryReconnect])

  if (status === 'loading') return <Splash />

  const g = (el: React.ReactNode, roles?: Role[]) => <Guard roles={roles}>{el}</Guard>
  return (
    <Suspense fallback={<LoadingBlock />}>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
        <Route element={g(<AppLayout />)}>
          <Route index element={<Home />} />
          <Route path="courses" element={<MyCourses />} />
          <Route path="catalog" element={<Catalog />} />
          <Route path="courses/:id" element={<CourseOverview />} />
          <Route path="learn/:courseId/:lessonId?" element={<CoursePlayer />} />
          <Route path="library" element={<LibraryPage />} />
          <Route path="tests" element={<TestsPage />} />
          <Route path="tests/:id" element={<TestTake />} />
          <Route path="attempts/:id" element={<AttemptPage />} />
          <Route path="results" element={<ResultsPage />} />
          <Route path="certificates" element={<CertificatesPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="offline" element={<OfflinePage />} />
          <Route path="assessments" element={<MyAssessments />} />
          <Route path="dialogues/:id" element={<DialoguePlay />} />

          <Route path="admin/courses" element={g(<StaffCourses />, STAFF)} />
          <Route path="admin/courses/new" element={g(<CourseEditor />, STAFF)} />
          <Route path="admin/courses/:id" element={g(<CourseEditor />, STAFF)} />
          <Route path="admin/library" element={g(<StaffLibrary />, STAFF)} />
          <Route path="admin/tests" element={g(<StaffTests />, STAFF)} />
          <Route path="admin/tests/:id" element={g(<TestEditor />, STAFF)} />
          <Route path="admin/employees" element={g(<Employees />, MANAGEMENT)} />
          <Route path="admin/employees/:id" element={g(<EmployeeDetail />, MANAGEMENT)} />
          <Route path="admin/departments" element={g(<Departments />, STAFF)} />
          <Route path="admin/assignments" element={g(<Assignments />, MANAGEMENT)} />
          <Route path="admin/analytics" element={g(<Analytics />, MANAGEMENT)} />
          <Route path="admin/competencies" element={g(<Competencies />, MANAGEMENT)} />
          <Route path="admin/documents" element={g(<Documents />, MANAGEMENT)} />
          <Route path="admin/settings" element={g(<SettingsPage />, STAFF)} />
          <Route path="admin/review" element={g(<ReviewPage />, STAFF)} />
          <Route path="admin/dialogues" element={g(<Dialogues />, STAFF)} />
          <Route path="admin/dialogues/:id" element={g(<DialogueEditor />, STAFF)} />
          <Route path="*" element={<div className="py-20 text-center"><p className="text-5xl font-bold text-brand-900">404</p><p className="mt-2 text-muted">{t('common.notFound')}</p></div>} />
        </Route>
      </Routes>
    </Suspense>
  )
}
