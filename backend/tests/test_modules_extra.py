import uuid


def test_dialogue_scoring(employee):
    scenarios = employee.get("/api/dialogues").json()
    assert scenarios
    sid = scenarios[0]["id"]
    pkg = employee.get(f"/api/dialogues/{sid}/play").json()
    node = next(n for n in pkg["nodes"] if n["is_start"])
    path = []
    nodes = {n["id"]: n for n in pkg["nodes"]}
    while node and node["choices"]:
        best = max(node["choices"], key=lambda c: c["score"])
        path.append(best["id"])
        node = nodes.get(best["next_node_id"])
    run_id = str(uuid.uuid4())
    r = employee.post("/api/sync/batch", json={"events": [{"id": str(uuid.uuid4()), "type": "dialogue_run",
                                                           "offline": True, "payload": {"run_id": run_id,
                                                                                        "scenario_id": sid,
                                                                                        "choice_ids": path}}]})
    res = r.json()["results"][0]
    assert res["status"] == "applied" and res["result"]["percent"] == 100
    # подделанный путь (выбор не из текущей реплики) отклоняется
    bad = employee.post(f"/api/dialogues/{sid}/runs", json={"run_id": str(uuid.uuid4()), "choice_ids": path[::-1]})
    assert bad.status_code == 422


def test_competency_360(employee, manager, methodist):
    mine = employee.get("/api/competencies/assessments").json()
    a = next(x for x in mine if x["my"] and x["my"]["relation"] == "self")
    scores = [{"question_id": q["id"], "score": 4} for c in a["competencies"] for q in c["questions"]]
    bad = employee.post(f"/api/competencies/assessments/{a['id']}/submit", json={"scores": scores[:1]})
    assert bad.status_code == 422
    r = employee.post(f"/api/competencies/assessments/{a['id']}/submit", json={"scores": scores})
    assert r.status_code == 200
    res = methodist.get(f"/api/competencies/assessments/{a['id']}/results").json()
    codes = [r["code"] for r in res["relations"]]
    assert "self" in codes and "manager" in codes
    assert all(row["by_relation"]["self"] == 4 for row in res["table"])
    assert employee.get(f"/api/competencies/assessments/{a['id']}/results").status_code == 403


def test_library_visibility(employee, methodist):
    items = employee.get("/api/library").json()["items"]
    titles = {i["title"] for i in items}
    assert "СОП-014. Вход в чистые помещения" in titles
    # материал только для склада не виден сотруднику цеха
    deps = {d["code"]: d["id"] for d in methodist.get("/api/departments").json()}
    r = methodist.post("/api/library", json={"title": "Только для склада", "url": "https://example.org/wh",
                                             "department_ids": [deps["WH"]]})
    assert r.status_code == 201
    assert "Только для склада" not in {i["title"] for i in employee.get("/api/library").json()["items"]}
    assert "Только для склада" in {i["title"] for i in methodist.get("/api/library").json()["items"]}


def test_crud_users_departments(admin):
    d = admin.post("/api/departments", json={"name": "Тестовый отдел", "code": "TST"}).json()
    u = admin.post("/api/users", json={"email": "new.user@dolce.local", "full_name": "Новый Сотрудник",
                                       "password": "Password12345", "role": "employee", "department_id": d["id"]})
    assert u.status_code == 201
    dup = admin.post("/api/users", json={"email": "new.user@dolce.local", "full_name": "Дубль",
                                         "password": "Password12345", "role": "employee"})
    assert dup.status_code == 409
    assert admin.delete(f"/api/departments/{d['id']}").status_code == 409
    assert admin.delete(f"/api/users/{u.json()['id']}").status_code == 200
    blocked = admin.post("/api/auth/login", json={"email": "new.user@dolce.local", "password": "Password12345"})
    assert blocked.status_code in (401, 403)
