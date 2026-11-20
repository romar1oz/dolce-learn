from datetime import date

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.core.deps import DB, CurrentUser, ManagerOrStaff, StaffUser, audit, ensure_can_view_user, get_or_404, scope_department_id
from app.models import (
    AssessmentProtocol,
    AssessmentProtocolEntry,
    Certificate,
    Course,
    CourseAssignment,
    Department,
    TestAttempt,
    User,
)
from app.schemas.common import Msg
from app.services.pdf import certificate_pdf, protocol_pdf
from app.services.progress import generate_number, issue_certificate, recompute_course

router = APIRouter(prefix="/api/certificates", tags=["certificates"])
protocols = APIRouter(prefix="/api/reports/protocols", tags=["reports"])


def cert_out(c: Certificate) -> dict:
    return {"id": c.id, "number": c.number, "user_id": c.user_id, "user_name": c.user.full_name,
            "department_name": c.user.department.name if c.user.department else None,
            "course_id": c.course_id, "course_title": c.course.title, "score": c.score, "status": c.status,
            "completed_at": c.completed_at, "issued_at": c.issued_at}


@router.get("")
def list_certificates(user: CurrentUser, db: DB, user_id: int | None = None, course_id: int | None = None):
    stmt = select(Certificate).join(User, User.id == Certificate.user_id).order_by(Certificate.issued_at.desc())
    if user.role.code == "employee":
        stmt = stmt.where(Certificate.user_id == user.id)
    else:
        scope = scope_department_id(user)
        if scope is not None:
            stmt = stmt.where(User.department_id == scope)
    if user_id:
        stmt = stmt.where(Certificate.user_id == user_id)
    if course_id:
        stmt = stmt.where(Certificate.course_id == course_id)
    return [cert_out(c) for c in db.scalars(stmt).unique().all()]


class IssueIn(BaseModel):
    user_id: int
    course_id: int


@router.post("/issue", status_code=201)
def issue(data: IssueIn, actor: StaffUser, db: DB, request: Request):
    course = get_or_404(db, Course, data.course_id, "Курс не найден")
    a = recompute_course(db, data.user_id, course.id)
    if a is None or a.status != "completed":
        raise HTTPException(409, "Курс ещё не завершён сотрудником — сертификат не может быть выдан")
    c = issue_certificate(db, data.user_id, course, a, issued_by=actor.id)
    audit(db, actor, "certificate.issue", "certificate", c.id, {"number": c.number}, request)
    db.commit()
    return cert_out(c)


@router.get("/{cert_id}/pdf")
def certificate_file(cert_id: int, user: CurrentUser, db: DB):
    c = get_or_404(db, Certificate, cert_id, "Сертификат не найден")
    if c.user_id != user.id:
        if user.role.code == "employee":
            raise HTTPException(403, "Нет доступа")
        ensure_can_view_user(db, user, c.user_id)
    pdf = certificate_pdf(number=c.number, full_name=c.user.full_name, course_title=c.course.title,
                          completed_at=c.completed_at, score=c.score, status=c.status,
                          department=c.user.department.name if c.user.department else None)
    return Response(pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="certificate_{c.number}.pdf"'})


@router.get("/verify/{number}")
def verify(number: str, _: CurrentUser, db: DB):
    c = db.scalar(select(Certificate).where(Certificate.number == number))
    if c is None:
        raise HTTPException(404, "Сертификат с таким номером не найден")
    return {"number": c.number, "user_name": c.user.full_name, "course_title": c.course.title,
            "issued_at": c.issued_at, "status": c.status}


# ---------------- protocols ----------------
class ProtocolIn(BaseModel):
    course_id: int
    department_id: int | None = None
    program_name: str | None = Field(default=None, max_length=255)
    check_date: date | None = None
    commission: str | None = Field(default=None, max_length=2000)
    only_attempted: bool = True


def protocol_out(p: AssessmentProtocol, db) -> dict:
    dep = db.get(Department, p.department_id) if p.department_id else None
    return {"id": p.id, "number": p.number, "program_name": p.program_name, "course_id": p.course_id,
            "department_id": p.department_id, "department_name": dep.name if dep else None,
            "check_date": p.check_date, "commission": p.commission, "created_at": p.created_at,
            "total": len(p.entries), "passed": sum(1 for e in p.entries if e.passed),
            "entries": [{"user_id": e.user_id, "full_name": e.full_name, "position_title": e.position_title,
                         "department_name": e.department_name, "score": e.score, "passed": e.passed}
                        for e in p.entries]}


@protocols.get("")
def list_protocols(_: ManagerOrStaff, db: DB):
    return [protocol_out(p, db) for p in
            db.scalars(select(AssessmentProtocol).order_by(AssessmentProtocol.created_at.desc())).all()]


@protocols.post("", status_code=201)
def create_protocol(data: ProtocolIn, actor: StaffUser, db: DB, request: Request):
    course = get_or_404(db, Course, data.course_id, "Курс не найден")
    stmt = select(CourseAssignment).join(User, User.id == CourseAssignment.user_id).where(
        CourseAssignment.course_id == course.id).order_by(User.full_name)
    if data.department_id:
        stmt = stmt.where(User.department_id == data.department_id)
    p = AssessmentProtocol(number=generate_number("DL-PR"), program_name=data.program_name or course.title,
                           course_id=course.id, department_id=data.department_id,
                           check_date=data.check_date or date.today(), commission=data.commission,
                           created_by=actor.id)
    pos = 0
    for a in db.scalars(stmt).unique().all():
        graded = db.scalars(select(TestAttempt).where(TestAttempt.user_id == a.user_id,
                                                      TestAttempt.course_id == course.id,
                                                      TestAttempt.status == "graded")).all()
        if data.only_attempted and not graded and a.status != "completed":
            continue
        pos += 1
        u = a.user
        p.entries.append(AssessmentProtocolEntry(
            user_id=u.id, full_name=u.full_name, position_title=u.position,
            department_name=u.department.name if u.department else None,
            score=max((x.percent for x in graded), default=None),
            passed=a.status == "completed" or any(x.passed for x in graded), position=pos))
    if not p.entries:
        raise HTTPException(422, "Нет сотрудников с результатами по этому курсу")
    db.add(p)
    db.flush()
    audit(db, actor, "protocol.create", "protocol", p.id, {"number": p.number}, request)
    db.commit()
    return protocol_out(p, db)


@protocols.get("/{protocol_id}/pdf")
def protocol_file(protocol_id: int, viewer: ManagerOrStaff, db: DB):
    p = get_or_404(db, AssessmentProtocol, protocol_id, "Протокол не найден")
    scope = scope_department_id(viewer)
    if scope is not None and p.department_id != scope:
        raise HTTPException(403, "Протокол другого подразделения")
    dep = db.get(Department, p.department_id) if p.department_id else None
    pdf = protocol_pdf(number=p.number, program_name=p.program_name, check_date=p.check_date,
                       department=dep.name if dep else None, commission=p.commission,
                       entries=[{"full_name": e.full_name, "position_title": e.position_title,
                                 "department_name": e.department_name, "score": e.score, "passed": e.passed}
                                for e in p.entries])
    return Response(pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="protocol_{p.number}.pdf"'})


@protocols.delete("/{protocol_id}", response_model=Msg)
def delete_protocol(protocol_id: int, actor: StaffUser, db: DB):
    db.delete(get_or_404(db, AssessmentProtocol, protocol_id, "Протокол не найден"))
    db.commit()
    return Msg(detail="Протокол удалён")
