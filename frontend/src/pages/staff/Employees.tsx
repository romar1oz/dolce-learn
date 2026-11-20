import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Pencil, Search, UserPlus, Users } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuth, isStaff } from '@/stores/auth'
import { Badge, Button, Card, Dialog, DialogContent, EmptyState, ErrorBlock, Field, Input, PageHeader, Select, Skeleton, SwitchRow, Table, Td, Th } from '@/components/ui'
import { fmtRelative, ROLE_LABEL } from '@/lib/utils'
import type { Department, Page, User } from '@/types'

const schema = z.object({
  email: z.string().trim().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Некорректный email'),
  full_name: z.string().trim().min(2, 'Укажите ФИО'),
  password: z.string().optional(),
  role: z.enum(['super_admin', 'methodist', 'manager', 'employee']),
  position: z.string().optional(),
  employee_number: z.string().optional(),
  phone: z.string().optional(),
  department_id: z.string().optional(),
  is_active: z.boolean(),
})
type F = z.infer<typeof schema>

function UserDialog({ open, onOpenChange, user, deps, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; user: User | null; deps: Department[]; onSaved: () => void }) {
  const me = useAuth((s) => s.user)!
  const f = useForm<F>({ resolver: zodResolver(schema), values: user ? {
    email: user.email, full_name: user.full_name, password: '', role: user.role, position: user.position || '', employee_number: user.employee_number || '',
    phone: user.phone || '', department_id: user.department_id ? String(user.department_id) : '', is_active: user.is_active,
  } : { email: '', full_name: '', password: '', role: 'employee', position: '', employee_number: '', phone: '', department_id: '', is_active: true } })
  const submit = async (v: F) => {
    if (!user && (!v.password || v.password.length < 10)) return f.setError('password', { message: 'Минимум 10 символов' })
    if (v.password && v.password.length < 10) return f.setError('password', { message: 'Минимум 10 символов' })
    const payload: any = { ...v, department_id: v.department_id ? Number(v.department_id) : null, employee_number: v.employee_number || null }
    if (!v.password) delete payload.password
    try {
      if (user) await api.patch(`/api/users/${user.id}`, payload)
      else await api.post('/api/users', payload)
      toast.success('Сохранено')
      onSaved()
      onOpenChange(false)
    } catch (e: any) { toast.error(e.message) }
  }
  const roles = me.role === 'super_admin' ? ['employee', 'manager', 'methodist', 'super_admin'] : ['employee', 'manager']
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={user ? 'Редактирование сотрудника' : 'Новый сотрудник'}>
        <form className="space-y-3" onSubmit={f.handleSubmit(submit)}>
          <Field label="ФИО" error={f.formState.errors.full_name?.message}><Input {...f.register('full_name')} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Email" error={f.formState.errors.email?.message}><Input {...f.register('email')} /></Field>
            <Field label={user ? 'Новый пароль' : 'Пароль'} error={f.formState.errors.password?.message} hint={user ? 'Оставьте пустым, чтобы не менять' : 'Не менее 10 символов'}>
              <Input type="password" autoComplete="new-password" {...f.register('password')} />
            </Field>
            <Field label="Роль"><Select {...f.register('role')} disabled={user?.id === me.id}>{roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</Select></Field>
            <Field label="Подразделение"><Select {...f.register('department_id')}><option value="">—</option>{deps.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
            <Field label="Должность"><Input {...f.register('position')} /></Field>
            <Field label="Табельный номер"><Input {...f.register('employee_number')} /></Field>
            <Field label="Телефон"><Input {...f.register('phone')} /></Field>
          </div>
          <SwitchRow label="Учётная запись активна" checked={f.watch('is_active')} onChange={(v) => f.setValue('is_active', v)} />
          <Button type="submit" className="w-full" loading={f.formState.isSubmitting}>Сохранить</Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default function Employees() {
  const me = useAuth((s) => s.user)!
  const staff = isStaff(me)
  const qc = useQueryClient()
  const [q, setQ] = useState('')
  const [role, setRole] = useState('')
  const [dep, setDep] = useState('')
  const [edit, setEdit] = useState<User | null | undefined>(undefined)
  const users = useQuery({ queryKey: ['users', q, role, dep], queryFn: () => api.get<Page<User>>('/api/users', { q, role, department_id: dep, page_size: 500 }) })
  const summary = useQuery({ queryKey: ['emp-summary', dep], queryFn: () => api.get<any[]>('/api/analytics/employees', { department_id: dep }) })
  const deps = useQuery({ queryKey: ['departments'], queryFn: () => api.get<Department[]>('/api/departments') })
  const stats = new Map((summary.data || []).map((s) => [s.user_id, s]))

  return (
    <div>
      <PageHeader title="Сотрудники" subtitle={staff ? 'Учётные записи, роли и прогресс обучения' : `Сотрудники подразделения «${me.department_name}»`}
                  actions={staff && <Button onClick={() => setEdit(null)}><UserPlus />Добавить</Button>} />
      <div className="mb-5 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1"><Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input className="pl-9" placeholder="ФИО, email, табельный номер, должность" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Select className="sm:w-44" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">Все роли</option>{Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        {staff && <Select className="sm:w-60" value={dep} onChange={(e) => setDep(e.target.value)}>
          <option value="">Все подразделения</option>{deps.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </Select>}
      </div>
      {users.error ? <ErrorBlock error={users.error} /> : users.isLoading ? <Skeleton className="h-80" />
        : !users.data?.items.length ? <EmptyState icon={Users} title="Сотрудники не найдены" />
        : (
          <Card>
            <Table>
              <thead><tr><Th>Сотрудник</Th><Th className="hidden md:table-cell">Подразделение</Th><Th>Обучение</Th><Th className="hidden lg:table-cell">Ср. балл</Th><Th className="hidden lg:table-cell">Активность</Th><Th /></tr></thead>
              <tbody>
                {users.data.items.map((u) => {
                  const s = stats.get(u.id)
                  return (
                    <tr key={u.id} className="hover:bg-slate-50">
                      <Td>
                        <Link to={`/admin/employees/${u.id}`} className="font-medium hover:underline">{u.full_name}</Link>
                        <span className="block text-xs text-muted">{u.position || '—'} · {ROLE_LABEL[u.role]}{!u.is_active && ' · '}{!u.is_active && <Badge variant="red">заблокирован</Badge>}</span>
                      </Td>
                      <Td className="hidden text-muted md:table-cell">{u.department_name || '—'}</Td>
                      <Td>{s ? <span className="text-sm">{s.completed}/{s.assigned}{s.overdue ? <Badge variant="red" className="ml-1.5">просрочено {s.overdue}</Badge> : null}</span> : <span className="text-muted">—</span>}</Td>
                      <Td className="hidden lg:table-cell">{s?.avg_score != null ? `${s.avg_score}%` : '—'}</Td>
                      <Td className="hidden text-xs text-muted lg:table-cell">{s ? fmtRelative(s.last_activity) : '—'}</Td>
                      <Td className="text-right">{staff && <Button size="icon-sm" variant="ghost" onClick={() => setEdit(u)} aria-label="Редактировать"><Pencil /></Button>}</Td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
          </Card>
        )}
      {staff && <UserDialog open={edit !== undefined} onOpenChange={(v) => !v && setEdit(undefined)} user={edit ?? null} deps={deps.data || []}
                            onSaved={() => qc.invalidateQueries({ queryKey: ['users'] })} />}
    </div>
  )
}
