export type Role = 'super_admin' | 'methodist' | 'manager' | 'employee'

export interface User {
  id: number
  email: string
  full_name: string
  position?: string | null
  employee_number?: string | null
  phone?: string | null
  role: Role
  role_name: string
  department_id?: number | null
  department_name?: string | null
  is_active: boolean
  locale: string
  last_login_at?: string | null
  created_at?: string | null
}

export interface TokenResponse {
  access_token: string
  expires_at: string
  refresh_expires_at: string
  user: User
}

export interface Page<T> {
  items: T[]
  total: number
  page: number
  page_size: number
}

export interface MediaBrief {
  id: string
  kind: string
  original_name: string
  mime_type: string
  size_bytes: number
  title?: string | null
  duration_sec?: number | null
  thumbnail_id?: string | null
}

export interface Material {
  id: number
  lesson_id: number
  kind: string
  title?: string | null
  body?: string | null
  url?: string | null
  media_id?: string | null
  test_id?: number | null
  dialogue_id?: number | null
  position: number
  media?: MediaBrief | null
}

export interface Lesson {
  id: number
  module_id: number
  title: string
  description?: string | null
  position: number
  duration_minutes: number
  materials: Material[]
}

export interface CourseModule {
  id: number
  course_id: number
  title: string
  description?: string | null
  position: number
  lessons: Lesson[]
}

export interface CourseSummary {
  id: number
  title: string
  description?: string | null
  cover_media_id?: string | null
  category_id?: number | null
  category_name?: string | null
  department_id?: number | null
  author_name?: string | null
  level: string
  duration_minutes: number
  is_mandatory: boolean
  publish_date?: string | null
  due_days?: number | null
  pass_score: number
  status: 'draft' | 'published' | 'archived'
  version: number
  module_count: number
  lesson_count: number
  assigned_count: number
  completed_count: number
  updated_at?: string
  progress_percent?: number | null
  assignment_status?: string | null
  due_date?: string | null
}

export interface CourseDetail extends CourseSummary {
  modules: CourseModule[]
}

export interface LearnerQuestion {
  id: number
  type: 'single' | 'multiple' | 'text' | 'ordering'
  text: string
  points: number
  options: { id: number; text: string }[]
}

export interface LearnerTest {
  id: number
  title: string
  description?: string | null
  course_id?: number | null
  course_title?: string
  pass_score: number
  time_limit_minutes?: number | null
  max_attempts?: number | null
  shuffle_questions: boolean
  shuffle_options: boolean
  question_count?: number | null
  questions_total?: number
  status: string
  available_from?: string | null
  available_until?: string | null
  questions: LearnerQuestion[]
  attempts_used: number
  best_percent?: number | null
  pending_review: number
}

export interface DialoguePackage {
  id: number
  title: string
  description?: string | null
  pass_score: number
  characters: { id: number; name: string; role?: string | null; color?: string | null }[]
  nodes: {
    id: number
    character_id?: number | null
    text: string
    is_start: boolean
    is_end: boolean
    choices: { id: number; text: string; next_node_id?: number | null; is_correct: boolean; score: number; feedback?: string | null }[]
  }[]
}

export interface CoursePackage {
  course: CourseDetail
  version: number
  generated_at: string
  tests: LearnerTest[]
  dialogues: DialoguePackage[]
  media: MediaBrief[]
  total_bytes: number
  progress: Record<string, { status: string; time_spent_sec: number; video_position_sec: number; completed_at?: string | null }>
  assignment: { status: string; progress_percent: number; due_date?: string | null; best_score?: number | null } | null
}

export interface AttemptAnswerReview {
  question_id: number
  question_text: string
  type: string
  points: number
  selected_option_ids: number[] | null
  text_answer?: string | null
  is_correct: boolean | null
  points_awarded: number
  needs_review: boolean
  reviewer_comment?: string | null
  explanation?: string | null
  options: { id: number; text: string; is_correct: boolean; position: number }[]
}

export interface AttemptResult {
  id: string
  test_id: number
  test_title: string
  course_id?: number | null
  status: 'graded' | 'needs_review' | 'rejected' | 'in_progress'
  score: number
  max_score: number
  percent: number
  passed: boolean | null
  pass_score: number
  attempt_number: number
  source: string
  submitted_at?: string | null
  duration_sec?: number | null
  rejection_reason?: string | null
  correct_count: number
  question_total: number
  answers: AttemptAnswerReview[]
  user_name?: string
  user_id?: number
  department_name?: string | null
}

export interface Assignment {
  id: number
  course_id: number
  course_title: string
  course_status: string
  is_mandatory: boolean
  cover_media_id?: string | null
  user_id: number
  user_name: string
  user_position?: string | null
  department_id?: number | null
  department_name?: string | null
  status: 'assigned' | 'in_progress' | 'completed'
  is_overdue: boolean
  progress_percent: number
  due_date?: string | null
  created_at: string
  started_at?: string | null
  completed_at?: string | null
  best_score?: number | null
  time_spent_sec: number
}

export interface Department {
  id: number
  name: string
  code: string
  description?: string | null
  manager_id?: number | null
  manager_name?: string | null
  employee_count: number
}

export interface Category {
  id: number
  name: string
  kind: 'course' | 'library'
  description?: string | null
}
