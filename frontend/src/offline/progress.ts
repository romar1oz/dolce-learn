import { db, type LessonLocalState } from './db'
import { enqueue } from './sync'

/** Локальное состояние урока (сливается с существующим, «завершён» не откатывается). */
export async function saveLessonLocal(userId: number, lessonId: number, courseId: number,
                                      patch: Partial<Pick<LessonLocalState, 'completed' | 'videoPosition'>>) {
  const key = `${userId}:${lessonId}`
  const prev = await db.lessons.get(key)
  await db.lessons.put({
    key, userId, lessonId, courseId,
    completed: !!(prev?.completed || patch.completed),
    videoPosition: patch.videoPosition ?? prev?.videoPosition,
    updatedAt: Date.now(),
  })
}

export async function completeLesson(userId: number, lessonId: number, courseId: number) {
  const prev = await db.lessons.get(`${userId}:${lessonId}`)
  await saveLessonLocal(userId, lessonId, courseId, { completed: true })
  if (!prev?.completed) await enqueue('lesson_complete', { lesson_id: lessonId, course_id: courseId })
}
