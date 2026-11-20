from sqlalchemy import exists, or_, select
from sqlalchemy.orm import Session

from app.models import (
    Course,
    CourseAssignment,
    CourseModule,
    Lesson,
    LessonMaterial,
    LibraryMaterial,
    MediaFile,
    User,
    library_material_departments,
)
from app.models.org import ROLE_METHODIST, ROLE_SUPER_ADMIN


def is_staff(user: User) -> bool:
    return user.role.code in (ROLE_SUPER_ADMIN, ROLE_METHODIST)


def visible_courses_clause(user: User):
    """Условие видимости курсов для обучающегося (сотрудник/руководитель)."""
    assigned = exists().where(CourseAssignment.course_id == Course.id, CourseAssignment.user_id == user.id)
    public = (Course.status == "published") & or_(Course.department_id.is_(None),
                                                    Course.department_id == user.department_id)
    return or_(assigned, public)


def can_view_course(db: Session, user: User, course: Course) -> bool:
    if is_staff(user):
        return True
    if course.status == "published" and (course.department_id is None or course.department_id == user.department_id):
        return True
    return db.scalar(select(exists().where(CourseAssignment.course_id == course.id,
                                           CourseAssignment.user_id == user.id))) or False


def library_visible_clause(user: User):
    no_restriction = ~exists().where(library_material_departments.c.material_id == LibraryMaterial.id)
    dept_match = exists().where(library_material_departments.c.material_id == LibraryMaterial.id,
                                library_material_departments.c.department_id == user.department_id)
    return or_(no_restriction, dept_match)


def can_access_media(db: Session, user: User, media: MediaFile) -> bool:
    if is_staff(user):
        return True
    ids = [media.id]
    parent = db.scalar(select(MediaFile.id).where(MediaFile.thumbnail_id == media.id))
    if parent:
        ids.append(parent)
    # Медиа внутри уроков доступных курсов
    stmt = (select(Course).join(CourseModule, CourseModule.course_id == Course.id)
            .join(Lesson, Lesson.module_id == CourseModule.id)
            .join(LessonMaterial, LessonMaterial.lesson_id == Lesson.id)
            .where(LessonMaterial.media_id.in_(ids)))
    for course in db.scalars(stmt).unique():
        if can_view_course(db, user, course):
            return True
    for course in db.scalars(select(Course).where(Course.cover_media_id.in_(ids))):
        if can_view_course(db, user, course):
            return True
    lib = db.scalar(select(exists().where(LibraryMaterial.media_id.in_(ids), library_visible_clause(user))))
    return bool(lib)
