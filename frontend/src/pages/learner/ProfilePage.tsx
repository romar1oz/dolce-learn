import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { KeyRound, LogOut } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuth } from '@/stores/auth'
import { Button, Card, CardContent, CardHeader, CardTitle, Field, Input, PageHeader, Select } from '@/components/ui'
import { fmtDateTime, initials, ROLE_LABEL } from '@/lib/utils'
import type { User } from '@/types'

const pwdSchema = z.object({
  current_password: z.string().min(1, 'Введите текущий пароль'),
  new_password: z.string().min(10, 'Не менее 10 символов').regex(/[0-9]/, 'Добавьте цифру').regex(/[A-Za-zА-Яа-я]/, 'Добавьте букву'),
  confirm: z.string(),
}).refine((v) => v.new_password === v.confirm, { path: ['confirm'], message: 'Пароли не совпадают' })

export default function ProfilePage() {
  const { user, setUser, logout } = useAuth()
  const navigate = useNavigate()
  const [phone, setPhone] = useState(user!.phone || '')
  const [locale, setLocale] = useState(user!.locale || 'ru')
  const [saving, setSaving] = useState(false)
  const f = useForm<z.infer<typeof pwdSchema>>({ resolver: zodResolver(pwdSchema) })

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Профиль" />
      <Card className="mb-5 flex items-center gap-4 p-5">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-900 text-xl font-bold text-white">{initials(user!.full_name)}</div>
        <div>
          <p className="text-lg font-semibold">{user!.full_name}</p>
          <p className="text-sm text-muted">{user!.position} · {user!.department_name}</p>
          <p className="text-sm text-muted">{ROLE_LABEL[user!.role]} · {user!.email}{user!.employee_number ? ` · таб. № ${user!.employee_number}` : ''}</p>
        </div>
      </Card>
      <div className="grid gap-5 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Настройки</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Field label="Телефон"><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+7 ..." /></Field>
            <Field label="Язык интерфейса" hint="Казахский и английский — частичный перевод (в разработке)">
              <Select value={locale} onChange={(e) => setLocale(e.target.value)}>
                <option value="ru">Русский</option><option value="kk">Қазақша</option><option value="en">English</option>
              </Select>
            </Field>
            <Button loading={saving} onClick={async () => {
              setSaving(true)
              try { setUser(await api.patch<User>('/api/auth/me', { phone, locale })); toast.success('Сохранено') }
              catch (e: any) { toast.error(e.message) } finally { setSaving(false) }
            }}>Сохранить</Button>
            <p className="text-xs text-muted">Последний вход: {fmtDateTime(user!.last_login_at)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Смена пароля</CardTitle><KeyRound className="h-4 w-4 text-muted" /></CardHeader>
          <CardContent>
            <form className="space-y-3" onSubmit={f.handleSubmit(async (v) => {
              try {
                await api.post('/api/auth/change-password', { current_password: v.current_password, new_password: v.new_password })
                toast.success('Пароль изменён. Войдите снова.')
                await logout()
                navigate('/login')
              } catch (e: any) { toast.error(e.message) }
            })}>
              <Field label="Текущий пароль" error={f.formState.errors.current_password?.message}><Input type="password" autoComplete="current-password" {...f.register('current_password')} /></Field>
              <Field label="Новый пароль" error={f.formState.errors.new_password?.message}><Input type="password" autoComplete="new-password" {...f.register('new_password')} /></Field>
              <Field label="Повторите пароль" error={f.formState.errors.confirm?.message}><Input type="password" autoComplete="new-password" {...f.register('confirm')} /></Field>
              <Button type="submit" variant="secondary" loading={f.formState.isSubmitting}>Изменить пароль</Button>
            </form>
          </CardContent>
        </Card>
      </div>
      <Button variant="outline" className="mt-6 lg:hidden" onClick={async () => { await logout(); navigate('/login') }}><LogOut />Выйти</Button>
    </div>
  )
}
