"""Сквозной сценарий: методист создаёт курс с видео, PDF и тестом → назначает → сотрудник проходит офлайн →
синхронизация (с повтором) → результаты, сертификат, аналитика, экспорт."""
import io
import uuid
from pathlib import Path

import pytest

ASSETS = Path(__file__).resolve().parents[1] / "app" / "assets" / "demo"
STATE: dict = {}


def test_upload_validation(methodist):
    fake = io.BytesIO(b"this is not a video at all" * 10)
    r = methodist.post("/api/materials/upload", files={"file": ("evil.mp4", fake, "video/mp4")})
    assert r.status_code == 415
    r = methodist.post("/api/materials/upload", files={"file": ("script.html", io.BytesIO(b"<script>"), "text/html")})
    assert r.status_code == 415


def test_methodist_builds_course(methodist):
    with open(ASSETS / "demo_test_video.mp4", "rb") as f:
        r = methodist.post("/api/materials/upload", files={"file": ("lesson.mp4", f, "video/mp4")},
                           data={"title": "Видео урока", "duration_sec": "24"})
    assert r.status_code == 201, r.text
    video = r.json()
    assert video["kind"] == "video" and video["duration_sec"] == 24
    pdf_bytes = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF"
    r = methodist.post("/api/materials/upload", files={"file": ("instr.pdf", io.BytesIO(pdf_bytes), "application/pdf")})
    assert r.status_code == 201
    pdf = r.json()
    with open(ASSETS / "cover_safety.png", "rb") as f:
        cover = methodist.post("/api/materials/upload", files={"file": ("cover.png", f, "image/png")}).json()

    r = methodist.post("/api/courses", json={"title": "Техника безопасности на производстве",
                                             "description": "Тестовый курс", "cover_media_id": cover["id"],
                                             "is_mandatory": True, "pass_score": 80, "due_days": 7})
    assert r.status_code == 201, r.text
    course = r.json()
    # нельзя опубликовать пустой курс
    assert methodist.patch(f"/api/courses/{course['id']}", json={"status": "published"}).status_code == 422
    mod = methodist.post(f"/api/courses/{course['id']}/modules", json={"title": "Модуль 1"}).json()
    l1 = methodist.post(f"/api/modules/{mod['id']}/lessons", json={"title": "Видео"}).json()
    l2 = methodist.post(f"/api/modules/{mod['id']}/lessons", json={"title": "Инструкция"}).json()
    l3 = methodist.post(f"/api/modules/{mod['id']}/lessons", json={"title": "Тест"}).json()
    assert methodist.post(f"/api/lessons/{l1['id']}/materials",
                          json={"kind": "video", "media_id": video["id"], "title": "Видео"}).status_code == 201
    # тип файла должен соответствовать типу блока
    assert methodist.post(f"/api/lessons/{l2['id']}/materials",
                          json={"kind": "pdf", "media_id": video["id"]}).status_code == 422
    assert methodist.post(f"/api/lessons/{l2['id']}/materials",
                          json={"kind": "pdf", "media_id": pdf["id"], "title": "PDF"}).status_code == 201
    # редактирование и порядок
    r = methodist.patch(f"/api/lessons/{l2['id']}", json={"title": "Инструкция по ТБ"})
    assert r.json()["title"] == "Инструкция по ТБ"
    assert methodist.post(f"/api/modules/{mod['id']}/lessons/reorder",
                          json={"ids": [l2["id"], l1["id"], l3["id"]]}).status_code == 200

    t = methodist.post("/api/tests", json={"title": "Тест ТБ", "course_id": course["id"], "pass_score": 80,
                                           "max_attempts": 2, "time_limit_minutes": 10}).json()
    qs = [
        {"type": "single", "text": "Q1", "options": [{"text": "A", "is_correct": True}, {"text": "B"}]},
        {"type": "single", "text": "Q2", "options": [{"text": "A"}, {"text": "B", "is_correct": True}]},
        {"type": "multiple", "text": "Q3", "options": [{"text": "A", "is_correct": True},
                                                       {"text": "B", "is_correct": True}, {"text": "C"}]},
        {"type": "ordering", "text": "Q4", "options": [{"text": "1"}, {"text": "2"}, {"text": "3"}]},
        {"type": "single", "text": "Q5", "options": [{"text": "A", "is_correct": True}, {"text": "B"}]},
    ]
    for q in qs:
        r = methodist.post(f"/api/tests/{t['id']}/questions", json=q)
        assert r.status_code == 201, r.text
    # некорректный вопрос
    assert methodist.post(f"/api/tests/{t['id']}/questions",
                          json={"type": "single", "text": "bad", "options": [{"text": "A"}]}).status_code == 422
    assert methodist.patch(f"/api/tests/{t['id']}", json={"status": "published"}).status_code == 200
    assert methodist.post(f"/api/lessons/{l3['id']}/materials",
                          json={"kind": "test", "test_id": t["id"], "title": "Тест"}).status_code == 201
    r = methodist.patch(f"/api/courses/{course['id']}", json={"status": "published"})
    assert r.status_code == 200 and r.json()["status"] == "published"
    full = methodist.get(f"/api/tests/{t['id']}").json()
    STATE.update(course=course, test=full, video=video, pdf=pdf)


def test_media_access_control(employee, methodist):
    v = STATE["video"]
    # пока курс не назначен, но опубликован без ограничений подразделения — доступен из каталога
    r = employee.get(f"/api/materials/{v['id']}/url")
    assert r.status_code == 200
    url = r.json()["url"]
    from fastapi.testclient import TestClient

    anon = TestClient(employee.app)
    full = anon.get(url)
    assert full.status_code == 200 and full.content[4:8] == b"ftyp"
    part = anon.get(url, headers={"Range": "bytes=0-99"})
    assert part.status_code == 206 and len(part.content) == 100
    assert anon.get(f"/api/materials/{v['id']}/file").status_code == 401
    assert anon.get(f"/api/materials/{v['id']}/file?sig=1.1.bad").status_code == 401
    # материалы курса-черновика сотруднику недоступны
    draft = methodist.post("/api/courses", json={"title": "Секретный черновик"}).json()
    mod = methodist.post(f"/api/courses/{draft['id']}/modules", json={"title": "М"}).json()
    les = methodist.post(f"/api/modules/{mod['id']}/lessons", json={"title": "Л"}).json()
    pdf_bytes = b"%PDF-1.4\nsecret\n%%EOF"
    secret = methodist.post("/api/materials/upload",
                            files={"file": ("secret.pdf", io.BytesIO(pdf_bytes), "application/pdf")}).json()
    methodist.post(f"/api/lessons/{les['id']}/materials", json={"kind": "pdf", "media_id": secret["id"]})
    assert employee.get(f"/api/materials/{secret['id']}/url").status_code == 403
    assert employee.get(f"/api/courses/{draft['id']}").status_code == 403


def test_assign_and_package(methodist, employee):
    course = STATE["course"]
    r = methodist.post("/api/assignments", json={"course_id": course["id"], "user_ids": [employee.user["id"]]})
    assert r.status_code == 201 and r.json()["created"] == 1
    again = methodist.post("/api/assignments", json={"course_id": course["id"], "user_ids": [employee.user["id"]]})
    assert again.json()["skipped"] == 1
    mine = employee.get("/api/progress/my").json()
    assert any(c["id"] == course["id"] for c in mine)
    pkg = employee.get(f"/api/courses/{course['id']}/package")
    assert pkg.status_code == 200
    body = pkg.json()
    assert len(body["media"]) >= 3  # обложка, видео, pdf
    assert body["tests"] and "is_correct" not in str(body["tests"])
    STATE["package"] = body


def _answers(test, good=True):
    out = []
    for q in test["questions"]:
        if q["type"] == "ordering":
            ids = [o["id"] for o in sorted(q["options"], key=lambda o: o["position"])]
        else:
            ids = [o["id"] for o in q["options"] if o["is_correct"] == good]
            if not good:
                ids = ids[:1]
        out.append({"question_id": q["id"], "selected_option_ids": ids})
    return out


def test_offline_attempt_sync_and_idempotency(employee, methodist):
    course, test = STATE["course"], STATE["test"]
    lessons = [l for m in STATE["package"]["course"]["modules"] for l in m["lessons"]]
    attempt_id = str(uuid.uuid4())
    events = []
    for lesson in lessons:
        events.append({"id": str(uuid.uuid4()), "type": "lesson_open", "offline": True,
                       "client_ts": "2026-01-01T10:00:00Z", "payload": {"lesson_id": lesson["id"]}})
        events.append({"id": str(uuid.uuid4()), "type": "heartbeat", "offline": True,
                       "payload": {"lesson_id": lesson["id"], "active_sec": 999, "media_sec": 20}})
        events.append({"id": str(uuid.uuid4()), "type": "lesson_complete", "offline": True,
                       "payload": {"lesson_id": lesson["id"]}})
    events.append({"id": str(uuid.uuid4()), "type": "test_attempt", "offline": True, "payload": {
        "attempt_id": attempt_id, "test_id": test["id"], "course_id": course["id"],
        "answers": _answers(test), "started_at": "2026-01-01T10:05:00Z", "finished_at": "2026-01-01T10:09:00Z"}})
    r = employee.post("/api/sync/batch", json={"device_id": "pytest", "events": events})
    assert r.status_code == 200, r.text
    results = r.json()["results"]
    assert all(x["status"] == "applied" for x in results), results
    att = results[-1]["result"]
    assert att["status"] == "graded" and att["percent"] == 100 and att["passed"] is True
    hb = [x for x in results if "accepted_sec" in (x.get("result") or {})]
    assert all(x["result"]["accepted_sec"] == 60 for x in hb), "heartbeat должен ограничиваться 60 сек"

    # повторная отправка той же пачки (например, ответ сервера потерялся) — без дублей
    r2 = employee.post("/api/sync/batch", json={"device_id": "pytest", "events": events})
    assert all(x["status"] == "duplicate" for x in r2.json()["results"])
    attempts = methodist.get("/api/attempts", params={"test_id": test["id"]}).json()
    assert attempts["total"] == 1
    a = attempts["items"][0]
    assert a["source"] == "offline" and a["user_id"] == employee.user["id"]

    prog = employee.get(f"/api/progress/courses/{course['id']}").json()
    assert prog["assignment"]["status"] == "completed"
    assert prog["assignment"]["progress_percent"] == 100
    assert all(v["time_spent_sec"] == 60 for v in prog["lessons"].values())
    STATE["attempt_id"] = attempt_id


def test_attempt_limits_and_wrong_answers(employee):
    test, course = STATE["test"], STATE["course"]
    r = employee.post("/api/attempts/submit", json={"attempt_id": str(uuid.uuid4()), "test_id": test["id"],
                                                    "course_id": course["id"], "answers": _answers(test, good=False)})
    assert r.status_code == 200
    assert r.json()["passed"] is False and r.json()["percent"] < 80
    # лимит 2 попытки исчерпан
    r = employee.post("/api/attempts/submit", json={"attempt_id": str(uuid.uuid4()), "test_id": test["id"],
                                                    "course_id": course["id"], "answers": _answers(test)})
    assert r.json()["status"] == "rejected"


def test_certificate_and_pdf(employee, methodist):
    certs = employee.get("/api/certificates").json()
    mine = [c for c in certs if c["course_id"] == STATE["course"]["id"]]
    assert len(mine) == 1 and mine[0]["score"] == 100
    pdf = employee.get(f"/api/certificates/{mine[0]['id']}/pdf")
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")
    r = methodist.post("/api/reports/protocols", json={"course_id": STATE["course"]["id"]})
    assert r.status_code == 201, r.text
    p = r.json()
    assert p["total"] >= 1 and p["passed"] >= 1
    assert methodist.get(f"/api/reports/protocols/{p['id']}/pdf").content.startswith(b"%PDF")


def test_analytics_and_exports(methodist, manager):
    ov = methodist.get("/api/analytics/overview").json()
    assert ov["employees"] >= 10 and ov["assignments"] > 0 and ov["completed"] > 0
    rep = methodist.get("/api/analytics/report", params={"course_id": STATE["course"]["id"]}).json()
    row = rep["items"][0]
    assert row["status"] == "completed" and row["best_score"] == 100 and row["has_offline"] is True
    assert row["time_spent_min"] >= 1
    x = methodist.get("/api/reports/export", params={"format": "xlsx"})
    assert x.status_code == 200 and x.content[:2] == b"PK"
    from openpyxl import load_workbook

    wb = load_workbook(io.BytesIO(x.content))
    assert wb.active.max_row > 5
    c = methodist.get("/api/reports/export", params={"format": "csv", "status": "completed"})
    text = c.content.decode("utf-8-sig")
    assert text.splitlines()[0].startswith("Сотрудник;")
    # руководитель видит только своё подразделение
    m = manager.get("/api/analytics/report").json()
    assert {r["department_name"] for r in m["items"]} == {"Цех твёрдых лекарственных форм"}


@pytest.mark.parametrize("dummy", [0])
def test_open_question_manual_review(methodist, app, dummy):
    from tests.conftest import login

    emp = login(app, "user01@dolce.local")
    tests = methodist.get("/api/tests", params={"q": "GMP"}).json()
    t = methodist.get(f"/api/tests/{tests[0]['id']}").json()
    answers = []
    for q in t["questions"]:
        if q["type"] == "text":
            answers.append({"question_id": q["id"], "text_answer": "Чтобы запись была достоверной"})
        else:
            answers.append({"question_id": q["id"],
                            "selected_option_ids": [o["id"] for o in q["options"] if o["is_correct"]]})
    r = emp.post("/api/attempts/submit", json={"attempt_id": str(uuid.uuid4()), "test_id": t["id"],
                                               "course_id": t["course_id"], "answers": answers}).json()
    assert r["status"] == "needs_review" and r["passed"] is None
    text_q = next(q for q in t["questions"] if q["type"] == "text")
    rv = methodist.post(f"/api/attempts/{r['id']}/review",
                        json={"items": [{"question_id": text_q["id"], "points": 1, "comment": "Верно"}]}).json()
    assert rv["status"] == "graded" and rv["passed"] is True and rv["percent"] == 100


def test_answers_hidden_before_finish(employee):
    t = STATE["test"]
    take = employee.get(f"/api/tests/{t['id']}/take").json()
    assert "is_correct" not in str(take) and "position" not in str(take["questions"])
