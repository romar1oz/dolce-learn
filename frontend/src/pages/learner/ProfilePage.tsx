import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { KeyRound, LogOut } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuth } from '@/stores/auth'
import { Button, Card, CardContent, CardHeader, CardTitle, Field, Input, PageHeader } from '@/components/ui'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { fmtDateTime, initials } from '@/lib/utils'
import { useT, type TKey } from '@/i18n'
import type { User } from '@/types'

export default function ProfilePage() {
  const { user, setUser, logout } = useAuth()
  const navigate = useNavigate()
  const t = useT()
  const [phone, setPhone] = useState(user!.phone || '')
  const [saving, setSaving] = useState(false)
  const pwdSchema = useMemo(() => z.object({
    current_password: z.string().min(1, t('prof.errCurrent')),
    new_password: z.string().min(10, t('prof.errMin')).regex(/[0-9]/, t('prof.errDigit')).regex(/[A-Za-zА-Яа-яӘәҒғҚқҢңӨөҰұҮүҺһІі]/, t('prof.errLetter')),
    confirm: z.string(),
  }).refine((v) => v.new_password === v.confirm, { path: ['confirm'], message: t('prof.errMatch') }), [t.locale]) // eslint-disable-line react-hooks/exhaustive-deps
  const f = useForm<z.infer<typeof pwdSchema>>({ resolver: zodResolver(pwdSchema) })

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t('nav.profile')} />
      <Card className="mb-5 flex items-center gap-4 p-5">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-brand-900 text-xl font-bold text-white">{initials(user!.full_name)}</div>
        <div className="min-w-0">
          <p className="text-lg font-semibold">{user!.full_name}</p>
          <p className="text-sm text-muted">{user!.position} · {user!.department_name}</p>
          <p className="text-sm break-all text-muted">{t(`role.${user!.role}` as TKey)} · {user!.email}{user!.employee_number ? ` · ${t('prof.tab')} ${user!.employee_number}` : ''}</p>
        </div>
      </Card>
      <div className="grid gap-5 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>{t('prof.settings')}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Field label={t('prof.language')} hint={user!.role === 'employee' ? undefined : t('prof.languageHint')}>
              <LanguageSwitcher />
            </Field>
            <Field label={t('prof.phone')}><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+7 ..." /></Field>
            <Button loading={saving} onClick={async () => {
              setSaving(true)
              try { setUser(await api.patch<User>('/api/auth/me', { phone })); toast.success(t('common.saved')) }
              catch (e: any) { toast.error(e.message) } finally { setSaving(false) }
            }}>{t('common.save')}</Button>
            <p className="text-xs text-muted">{t('prof.lastLogin', { date: fmtDateTime(user!.last_login_at) })}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t('prof.changePassword')}</CardTitle><KeyRound className="h-4 w-4 text-muted" /></CardHeader>
          <CardContent>
            <form className="space-y-3" onSubmit={f.handleSubmit(async (v) => {
              try {
                await api.post('/api/auth/change-password', { current_password: v.current_password, new_password: v.new_password })
                toast.success(t('prof.changed'))
                await logout()
                navigate('/login')
              } catch (e: any) { toast.error(e.message) }
            })}>
              <Field label={t('prof.current')} error={f.formState.errors.current_password?.message}><Input type="password" autoComplete="current-password" {...f.register('current_password')} /></Field>
              <Field label={t('prof.new')} error={f.formState.errors.new_password?.message}><Input type="password" autoComplete="new-password" {...f.register('new_password')} /></Field>
              <Field label={t('prof.repeat')} error={f.formState.errors.confirm?.message}><Input type="password" autoComplete="new-password" {...f.register('confirm')} /></Field>
              <Button type="submit" variant="secondary" loading={f.formState.isSubmitting}>{t('prof.change')}</Button>
            </form>
          </CardContent>
        </Card>
      </div>
      <Button variant="outline" className="mt-6 lg:hidden" onClick={async () => { await logout(); navigate('/login') }}><LogOut />{t('common.logout')}</Button>
    </div>
  )
}
