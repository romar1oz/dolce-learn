"""Генерация PDF-сертификатов и протоколов аттестации (ReportLab, шрифт DejaVu с кириллицей)."""
import io
from datetime import datetime
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

FONT_DIR = Path(__file__).resolve().parents[1] / "assets" / "fonts"
DARK = colors.HexColor("#064E3B")
ACCENT = colors.HexColor("#10B981")
LIGHT = colors.HexColor("#D1FAE5")
MUTED = colors.HexColor("#64748B")
_registered = False


def _fonts():
    global _registered
    if not _registered:
        pdfmetrics.registerFont(TTFont("DejaVu", str(FONT_DIR / "DejaVuSans.ttf")))
        pdfmetrics.registerFont(TTFont("DejaVu-Bold", str(FONT_DIR / "DejaVuSans-Bold.ttf")))
        _registered = True


def _d(v) -> str:
    if v is None:
        return "—"
    if isinstance(v, datetime):
        return v.astimezone().strftime("%d.%m.%Y")
    return v.strftime("%d.%m.%Y")


def certificate_pdf(*, number: str, full_name: str, course_title: str, completed_at, score: float | None,
                    status: str, company: str = "Dolce Pharm", department: str | None = None) -> bytes:
    _fonts()
    buf = io.BytesIO()
    from reportlab.pdfgen import canvas

    w, h = landscape(A4)
    c = canvas.Canvas(buf, pagesize=(w, h))
    c.setTitle(f"Сертификат {number}")
    c.setFillColor(colors.white)
    c.rect(0, 0, w, h, fill=1, stroke=0)
    c.setFillColor(DARK)
    c.rect(0, h - 28 * mm, w, 28 * mm, fill=1, stroke=0)
    c.setFillColor(ACCENT)
    c.rect(0, h - 30 * mm, w, 2 * mm, fill=1, stroke=0)
    c.setStrokeColor(LIGHT)
    c.setLineWidth(3)
    c.roundRect(12 * mm, 12 * mm, w - 24 * mm, h - 50 * mm, 6 * mm, stroke=1, fill=0)
    c.setFillColor(colors.white)
    c.setFont("DejaVu-Bold", 18)
    c.drawString(20 * mm, h - 17 * mm, "Dolce Learn")
    c.setFont("DejaVu", 11)
    c.drawRightString(w - 20 * mm, h - 17 * mm, f"{company} · Учебный центр")

    c.setFillColor(DARK)
    c.setFont("DejaVu-Bold", 34)
    c.drawCentredString(w / 2, h - 62 * mm, "СЕРТИФИКАТ")
    c.setFillColor(MUTED)
    c.setFont("DejaVu", 13)
    c.drawCentredString(w / 2, h - 72 * mm, "о прохождении обучения")
    c.setFillColor(colors.HexColor("#111827"))
    c.setFont("DejaVu", 13)
    c.drawCentredString(w / 2, h - 88 * mm, "Настоящим подтверждается, что")
    c.setFont("DejaVu-Bold", 24)
    c.drawCentredString(w / 2, h - 101 * mm, full_name)
    if department:
        c.setFont("DejaVu", 11)
        c.setFillColor(MUTED)
        c.drawCentredString(w / 2, h - 109 * mm, department)
    c.setFillColor(colors.HexColor("#111827"))
    c.setFont("DejaVu", 13)
    c.drawCentredString(w / 2, h - 121 * mm, "успешно завершил(а) курс")
    style = ParagraphStyle("t", fontName="DejaVu-Bold", fontSize=17, leading=21, alignment=1, textColor=DARK)
    p = Paragraph(course_title, style)
    pw, ph = p.wrap(w - 80 * mm, 40 * mm)
    p.drawOn(c, (w - pw) / 2, h - 128 * mm - ph)

    y = 32 * mm
    c.setFont("DejaVu", 10)
    c.setFillColor(MUTED)
    cols = [("Дата прохождения", _d(completed_at)),
            ("Набранный балл", f"{score:.1f} %" if score is not None else "—"),
            ("Статус", "Действителен" if status == "valid" else status),
            ("Номер документа", number)]
    step = (w - 40 * mm) / len(cols)
    for i, (label, val) in enumerate(cols):
        x = 20 * mm + step * i + step / 2
        c.setFillColor(MUTED)
        c.setFont("DejaVu", 9)
        c.drawCentredString(x, y + 7 * mm, label)
        c.setFillColor(DARK)
        c.setFont("DejaVu-Bold", 12)
        c.drawCentredString(x, y, val)
    c.setFillColor(MUTED)
    c.setFont("DejaVu", 7.5)
    c.drawCentredString(w / 2, 15 * mm, "Документ сформирован автоматически системой Dolce Learn. "
                                         "Подлинность проверяется по номеру в реестре сертификатов.")
    c.showPage()
    c.save()
    return buf.getvalue()


def protocol_pdf(*, number: str, program_name: str, check_date, department: str | None, commission: str | None,
                 entries: list[dict], company: str = "Dolce Pharm") -> bytes:
    _fonts()
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=18 * mm,
                            bottomMargin=18 * mm, title=f"Протокол {number}")
    base = ParagraphStyle("b", fontName="DejaVu", fontSize=10, leading=14)
    h1 = ParagraphStyle("h1", parent=base, fontName="DejaVu-Bold", fontSize=15, leading=19, alignment=1,
                        textColor=DARK)
    small = ParagraphStyle("s", parent=base, fontSize=8.5, leading=11, textColor=MUTED)
    cell = ParagraphStyle("c", parent=base, fontSize=9, leading=11)
    story = [
        Paragraph(f"{company} · Учебный центр", small),
        Spacer(1, 4 * mm),
        Paragraph(f"ПРОТОКОЛ АТТЕСТАЦИИ № {number}", h1),
        Spacer(1, 5 * mm),
        Paragraph(f"<b>Программа:</b> {program_name}", base),
        Paragraph(f"<b>Дата проверки:</b> {_d(check_date)}", base),
    ]
    if department:
        story.append(Paragraph(f"<b>Подразделение:</b> {department}", base))
    if commission:
        story.append(Paragraph(f"<b>Комиссия:</b> {commission}", base))
    story.append(Spacer(1, 5 * mm))
    data = [["№", "ФИО", "Должность / подразделение", "Балл, %", "Решение"]]
    for i, e in enumerate(entries, 1):
        data.append([
            str(i), Paragraph(e["full_name"], cell),
            Paragraph(" / ".join(x for x in [e.get("position_title"), e.get("department_name")] if x) or "—", cell),
            f"{e['score']:.1f}" if e.get("score") is not None else "—",
            Paragraph("<b>Аттестован</b>" if e["passed"] else "Не аттестован", cell),
        ])
    t = Table(data, colWidths=[9 * mm, 52 * mm, 62 * mm, 18 * mm, 31 * mm], repeatRows=1)
    t.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), "DejaVu"),
        ("FONTNAME", (0, 0), (-1, 0), "DejaVu-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("BACKGROUND", (0, 0), (-1, 0), DARK),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#CBD5E1")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (3, 1), (3, -1), "CENTER"),
    ]))
    story.append(t)
    passed = sum(1 for e in entries if e["passed"])
    story += [Spacer(1, 5 * mm),
              Paragraph(f"Всего: {len(entries)}. Аттестовано: {passed}. Не аттестовано: {len(entries) - passed}.",
                        base),
              Spacer(1, 14 * mm),
              Paragraph("Председатель комиссии: ____________________ /____________/", base),
              Spacer(1, 6 * mm),
              Paragraph("Члены комиссии: ____________________ /____________/", base),
              Spacer(1, 10 * mm),
              Paragraph(f"Сформировано в Dolce Learn {datetime.now():%d.%m.%Y %H:%M}", small)]
    doc.build(story)
    return buf.getvalue()
