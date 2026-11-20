from fastapi.testclient import TestClient

from tests.conftest import PASSWORD, login


def test_login_each_role(app):
    for email, role in [("admin@dolce.local", "super_admin"), ("methodist@dolce.local", "methodist"),
                        ("manager@dolce.local", "manager"), ("employee@dolce.local", "employee")]:
        c = login(app, email)
        me = c.get("/api/auth/me")
        assert me.status_code == 200
        assert me.json()["role"] == role


def test_wrong_password_and_unauthenticated(app):
    c = TestClient(app)
    r = c.post("/api/auth/login", json={"email": "employee@dolce.local", "password": "wrong-pass"})
    assert r.status_code == 401
    assert c.get("/api/auth/me").status_code == 401
    assert c.get("/api/courses").status_code == 401
    c.headers["Authorization"] = "Bearer not-a-token"
    assert c.get("/api/auth/me").status_code == 401


def test_refresh_rotation_and_logout(app):
    c = TestClient(app)
    r = c.post("/api/auth/login", json={"email": "employee@dolce.local", "password": PASSWORD})
    assert r.status_code == 200
    old_cookie = c.cookies.get("dl_refresh")
    assert old_cookie, "refresh cookie должен быть установлен"
    r2 = c.post("/api/auth/refresh")
    assert r2.status_code == 200 and r2.json()["access_token"]
    new_cookie = c.cookies.get("dl_refresh")
    assert new_cookie != old_cookie
    # повторное использование старого токена отзывает всё семейство
    reuse = TestClient(app)
    reuse.cookies.set("dl_refresh", old_cookie, path="/api/auth")
    assert reuse.post("/api/auth/refresh").status_code == 401
    assert c.post("/api/auth/refresh").status_code == 401
    # logout
    c2 = login(app, "employee@dolce.local")
    assert c2.post("/api/auth/logout").status_code == 200
    assert c2.post("/api/auth/refresh").status_code == 401


def test_role_restrictions(employee, manager, methodist, admin):
    assert employee.get("/api/users").status_code == 403
    assert employee.post("/api/courses", json={"title": "Взлом"}).status_code == 403
    assert employee.get("/api/analytics/overview").status_code == 403
    assert employee.get("/api/reports/export").status_code == 403
    assert manager.post("/api/courses", json={"title": "Курс руководителя"}).status_code == 403
    assert methodist.get("/api/audit").status_code == 403
    assert admin.get("/api/audit").status_code == 200
    # методист не может создать Super Admin
    r = methodist.post("/api/users", json={"email": "x@dolce.local", "full_name": "Икс Икс", "password": "Secret12345",
                                           "role": "super_admin"})
    assert r.status_code == 403


def test_manager_sees_only_own_department(manager):
    r = manager.get("/api/users")
    assert r.status_code == 200
    deps = {u["department_id"] for u in r.json()["items"]}
    assert deps == {manager.user["department_id"]}
    # чужой сотрудник
    other = manager.get("/api/users", params={"q": "Садыков"}).json()["items"]
    assert other == []


def test_employee_cannot_change_own_role(employee):
    r = employee.patch("/api/auth/me", json={"full_name": "Ким Дмитрий (демо-сотрудник)"})
    assert r.status_code == 200
    assert r.json()["role"] == "employee"
    r = employee.patch(f"/api/users/{employee.user['id']}", json={"role": "super_admin"})
    assert r.status_code == 403
