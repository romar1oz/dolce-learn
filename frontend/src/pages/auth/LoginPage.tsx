import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useLocation, useNavigate } from 'react-router-dom'
import { CloudOff, Eye, EyeOff, ShieldCheck, WifiOff, BookOpenCheck } from 'lucide-react'
import { useAuth } from '@/stores/auth'
import { Button, Field, Input } from '@/components/ui'
import { Logo } from '@/components/Logo'
import { NetworkError } from '@/lib/api'
import { useSync } from '@/offline/sync'

const schema = z.object({
  email: z.string().trim().min(1, 'Введите email').regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Некорректный email'),
  password: z.string().min(1, 'Введите пароль'),
})
type Form = z.infer<typeof schema>

export default function LoginPage() {
  const login = useAuth((s) => s.login)
  const navigate = useNavigate()
  const loc = useLocation() as { state?: { from?: string } }
  const online = useSync((s) => s.online)
  const [show, setShow] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Form>({ resolver: zodResolver(schema) })

  const onSubmit = async (v: Form) => {
    setError(null)
    try {
      await login(v.email, v.password)
      navigate(loc.state?.from && loc.state.from !== '/login' ? loc.state.from : '/', { replace: true })
    } catch (e) {
      setError(e instanceof NetworkError ? 'Нет соединения с сервером. Для первого входа нужен интернет.'
        : e instanceof Error ? e.message : 'Ошибка входа')
    }
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden overflow-hidden bg-brand-900 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -top-40 -right-40 h-[480px] w-[480px] rounded-full bg-brand-500/25 blur-2xl" />
        <div className="absolute -bottom-32 -left-24 h-[380px] w-[380px] rounded-full bg-brand-200/10 blur-2xl" />
        <Logo dark />
        <div className="relative max-w-lg">
          <h1 className="text-4xl leading-tight font-bold tracking-tight">Обучение и аттестация персонала — даже без интернета</h1>
          <p className="mt-4 text-brand-100/80">Курсы, СОП, видеоинструкции и тесты для производственных сотрудников Dolce Pharm.</p>
          <div className="mt-10 grid gap-3">
            {[[BookOpenCheck, 'Курсы, тесты и сертификаты в одном месте'], [CloudOff, 'Скачайте курс и учитесь в цеху без сети'],
              [ShieldCheck, 'Данные хранятся на локальном сервере компании']].map(([Icon, text]: any) => (
              <div key={text} className="flex items-center gap-3 rounded-2xl bg-white/8 p-3.5 text-sm">
                <div className="rounded-xl bg-brand-500/30 p-2"><Icon className="h-5 w-5" /></div>{text}
              </div>
            ))}
          </div>
        </div>
        <p className="relative text-xs text-brand-100/60">© Dolce Pharm · Учебный центр</p>
      </div>

      <div className="flex items-center justify-center p-5 sm:p-10">
        <div className="w-full max-w-sm">
          <Logo className="mb-10 lg:hidden" />
          <h2 className="text-2xl font-bold tracking-tight">Вход в систему</h2>
          <p className="mt-1 text-sm text-muted">Используйте корпоративную учётную запись</p>
          {!online && (
            <div className="mt-5 flex gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
              <WifiOff className="mt-0.5 h-4 w-4 shrink-0" />
              Нет подключения к сети. Вход возможен только онлайн; ранее авторизованные пользователи открывают приложение без входа.
            </div>
          )}
          <form className="mt-6 space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
            <Field label="Email" error={errors.email?.message}>
              <Input type="email" autoComplete="username" placeholder="name@dolce.local" {...register('email')} />
            </Field>
            <Field label="Пароль" error={errors.password?.message}>
              <div className="relative">
                <Input type={show ? 'text' : 'password'} autoComplete="current-password" className="pr-10" {...register('password')} />
                <button type="button" onClick={() => setShow(!show)} className="absolute top-1/2 right-2 -translate-y-1/2 rounded-lg p-1.5 text-muted hover:bg-slate-100"
                        aria-label={show ? 'Скрыть пароль' : 'Показать пароль'}>
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </Field>
            {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}
            <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>Войти</Button>
          </form>
          <p className="mt-6 text-center text-xs text-muted">Забыли пароль? Обратитесь к администратору учебного центра.</p>
        </div>
      </div>
    </div>
  )
}
