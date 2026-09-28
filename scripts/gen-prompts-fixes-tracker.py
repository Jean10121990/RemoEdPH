# -*- coding: utf-8 -*-
"""Generate RemoEd PH prompts/fixes Excel tracker (Sep 26 9PM PHT → now)."""
import xlsxwriter
from datetime import datetime
from pathlib import Path

out = Path(__file__).resolve().parents[1] / "docs" / "RemoEdPH-Prompts-Fixes-Tracker-2026-09-26-9PM.xlsx"
out.parent.mkdir(parents=True, exist_ok=True)

# Consolidated deliverables (deduped from chat prompts). Status as of generation time.
rows = [
    dict(
        id="TSK-001",
        owner="Jean",
        desc="Fix Remo robot face (human → original) for Level 4 Month 1 Lesson 10; update lesson-references + SKILLS.md",
        phase="Phase 1 (Sep 26–27)",
        status="Done",
        priority="High",
        start="2026-09-26",
        target="2026-09-26",
        notes="remoed-lesson-creation skill · ~9:12 PM",
    ),
    dict(
        id="TSK-002",
        owner="Jean",
        desc="Forgot/reset password: set new password immediately instead of emailing temporary password (all user types)",
        phase="Phase 1 (Sep 26–27)",
        status="Done",
        priority="High",
        start="2026-09-26",
        target="2026-09-26",
        notes="Password reset UX shortened · ~9:12 PM",
    ),
    dict(
        id="TSK-003",
        owner="Jean",
        desc="Profile validation: valid email only; inline field errors; remove redundant country; block save without required fields",
        phase="Phase 1 (Sep 26–27)",
        status="Done",
        priority="High",
        start="2026-09-26",
        target="2026-09-26",
        notes="Student/profile form validation · ~9:22 PM",
    ),
    dict(
        id="TSK-004",
        owner="Jean",
        desc="Phone: phone number only (not national number); parent/guardian = emergency contact",
        phase="Phase 1 (Sep 26–27)",
        status="Done",
        priority="Medium",
        start="2026-09-26",
        target="2026-09-26",
        notes="Contact fields aligned · ~9:30 PM",
    ),
    dict(
        id="TSK-005",
        owner="Jean",
        desc="Password requirements below field + strength meter (weak / strong / super strong)",
        phase="Phase 1 (Sep 26–27)",
        status="Done",
        priority="Medium",
        start="2026-09-26",
        target="2026-09-26",
        notes="Change-password / reset UI · ~10:06 PM",
    ),
    dict(
        id="TSK-006",
        owner="Jean",
        desc="Lucide eye/eye-off on all password fields (no emoji); fix change-password bugs to succeed",
        phase="Phase 1 (Sep 26–27)",
        status="Done",
        priority="High",
        start="2026-09-26",
        target="2026-09-26",
        notes="password-toggle.js · ~10:08 PM",
    ),
    dict(
        id="TSK-007",
        owner="Jean",
        desc="Adopt Lucide.dev as system icon reference; document in SKILLS.md + STABLE_BASELINE.md",
        phase="Phase 1 (Sep 26–27)",
        status="Done",
        priority="High",
        start="2026-09-26",
        target="2026-09-26",
        notes="lucide-icons.js catalog · ~10:15 PM",
    ),
    dict(
        id="TSK-008",
        owner="Jean",
        desc="Widen password UI for desktop; eye toggle inside field; require symbol in password rules",
        phase="Phase 1 (Sep 26–27)",
        status="Done",
        priority="Medium",
        start="2026-09-26",
        target="2026-09-26",
        notes="Desktop layout polish · ~10:22 PM",
    ),
    dict(
        id="TSK-009",
        owner="Jean",
        desc="Restore student waiting room when teacher not in live classroom yet (mini-game/video); Lucide icons for camera etc.",
        phase="Phase 1 (Sep 26–27)",
        status="Done",
        priority="High",
        start="2026-09-26",
        target="2026-09-26",
        notes="student-class-wait.js · ~10:25 PM",
    ),
    dict(
        id="TSK-010",
        owner="Jean",
        desc="Teacher guide Skip; careful chat bad-word filter (student sees ****; teacher can reveal); Lucide mic/cam controls",
        phase="Phase 1 (Sep 26–27)",
        status="Done",
        priority="High",
        start="2026-09-26",
        target="2026-09-26",
        notes="Live classroom chat + media pills · ~10:51 PM",
    ),
    dict(
        id="TSK-011",
        owner="Jean",
        desc="Hide Give Feedback after submit; QA issue → notify students to reschedule; bi-monthly cut-offs; payslip withdrawable amount",
        phase="Phase 1 (Sep 26–27)",
        status="Done",
        priority="High",
        start="2026-09-26",
        target="2026-09-27",
        notes="Feedback + QA notify + payroll periods · ~11:46 PM",
    ),
    dict(
        id="TSK-012",
        owner="Jean",
        desc="Student booking cap: max 2 classes / 1 hour per student local day",
        phase="Phase 1 (Sep 26–27)",
        status="Done",
        priority="High",
        start="2026-09-26",
        target="2026-09-26",
        notes="DAILY_CLASS_LIMIT · ~11:57 PM",
    ),
    dict(
        id="TSK-013",
        owner="Jean",
        desc="Teaching Fee wallet UX: Total Earnings header; Available to Withdraw; after withdraw keep cut-off amount + label Withdrawn (not ₱0)",
        phase="Phase 1 (Sep 26–27)",
        status="Done",
        priority="High",
        start="2026-09-27",
        target="2026-09-27",
        notes="teacher-service-fee.html iterations · ~12:04–12:17 AM",
    ),
    dict(
        id="TSK-014",
        owner="Jean",
        desc="Payslip status still Pending after withdraw → show withdrawn/completed correctly",
        phase="Phase 1 (Sep 26–27)",
        status="Done",
        priority="High",
        start="2026-09-27",
        target="2026-09-27",
        notes="Payslip lifecycle mapping · ~12:21 AM",
    ),
    dict(
        id="TSK-015",
        owner="Jean",
        desc="Remove redundant Withdrawn chip beside Pending Earnings",
        phase="Phase 1 (Sep 26–27)",
        status="Done",
        priority="Medium",
        start="2026-09-27",
        target="2026-09-27",
        notes="Teaching Fee wallet cleanup · ~12:26 AM",
    ),
    dict(
        id="TSK-016",
        owner="Jean",
        desc="Payslip amount bug: showed PHP 1000 instead of 1140 (include class fee / max snap vs live)",
        phase="Phase 1 (Sep 26–27)",
        status="Done",
        priority="High",
        start="2026-09-27",
        target="2026-09-27",
        notes="Payslip totals fix · ~12:27 AM",
    ),
    dict(
        id="TSK-017",
        owner="Jean",
        desc="Undo salary dispense for current cut-off so amounts can be retested",
        phase="Phase 1 (Sep 26–27)",
        status="Done",
        priority="High",
        start="2026-09-27",
        target="2026-09-27",
        notes="scripts/undo-cutoff-salary-dispense.js · ~12:30 AM",
    ),
    dict(
        id="TSK-018",
        owner="Jean",
        desc="MariBank max daily withdraw PHP 50,000 note when Available exceeds limit",
        phase="Phase 1 (Sep 26–27)",
        status="Done",
        priority="High",
        start="2026-09-27",
        target="2026-09-27",
        notes="Teaching Fee + withdraw modal · ~12:45 AM",
    ),
    dict(
        id="TSK-019",
        owner="Jean",
        desc="Min withdraw PHP 100 (else rolls to next cut-off); unwithdrawn DISBURSED carries forward; daily max PHP 50k",
        phase="Phase 1 (Sep 26–27)",
        status="Done",
        priority="High",
        start="2026-09-27",
        target="2026-09-27",
        notes="payrollWithdrawService + dispense carry-forward · ~12:53 AM",
    ),
    dict(
        id="TSK-020",
        owner="Jean",
        desc='Post-assessment Plans: "You have taken the assessment" + Register Now; retake same email → already taken, check email',
        phase="Phase 1 (Sep 26–27)",
        status="Done",
        priority="High",
        start="2026-09-27",
        target="2026-09-27",
        notes="index.html + assessment-status API · ~1:18 AM",
    ),
    dict(
        id="TSK-021",
        owner="Jean",
        desc="Register: first+last name then email; prefill email from assessment link; fix Invalid/already used trial link — no expire except email already registered",
        phase="Phase 1 (Sep 26–27)",
        status="Done",
        priority="High",
        start="2026-09-27",
        target="2026-09-27",
        notes="student-register.html + auth trial resolve · ~1:38 AM",
    ),
    dict(
        id="TSK-022",
        owner="Jean",
        desc="Credit expiry: keep longest plan expiry; buying a shorter plan must not shorten remaining days (add/stack correctly)",
        phase="Phase 1 (Sep 26–27)",
        status="Done",
        priority="High",
        start="2026-09-27",
        target="2026-09-27",
        notes="creditExpiry / plan stacking · ~1:53–1:54 AM",
    ),
    dict(
        id="TSK-023",
        owner="Jean",
        desc="Per-plan FIFO credit lots: earlier subscription credits expire/use first before newer plan credits (e.g. 3mo then 6mo)",
        phase="Phase 1 (Sep 26–27)",
        status="Done",
        priority="High",
        start="2026-09-27",
        target="2026-09-27",
        notes="creditLots + bookingCreditLedger · ~2:03 AM",
    ),
    dict(
        id="TSK-024",
        owner="Jean",
        desc="Book Class: Booking Details must be centered modal (not side panel); block jump-forward lessons; allow back/reschedule",
        phase="Phase 1 (Sep 26–27)",
        status="Done",
        priority="High",
        start="2026-09-27",
        target="2026-09-27",
        notes="student-book modal + studentLessonUnlock + journey · ~2:14 AM",
    ),
    dict(
        id="TSK-025",
        owner="Jean",
        desc="Generate Excel prompts/fixes tracker (Done vs Pending) from Sep 26 9PM PHT → now, matching Pre-Launch tracker layout",
        phase="Phase 1 (Sep 26–27)",
        status="Done",
        priority="Medium",
        start="2026-09-27",
        target="2026-09-27",
        notes="docs/RemoEdPH-Prompts-Fixes-Tracker-2026-09-26-9PM.xlsx · ~2:28 AM",
    ),
]

# Chronological raw prompt log (deduped near-duplicates collapsed).
raw = [
    ("2026-09-26 21:12", "Why Remo the robot's face become a human? Change it to its original face for L4M1 Lesson 10…", "Done"),
    ("2026-09-26 21:12", "First-time forgot/reset password → change password immediately (no temp email password)", "Done"),
    ("2026-09-26 21:22", "Valid email only; inline validation errors; no redundant country; required fields to save", "Done"),
    ("2026-09-26 21:30", "Only phone number not national number; parent/guardian = emergency contact", "Done"),
    ("2026-09-26 22:06", "Password requirements below field + weak/strong/super strong meter", "Done"),
    ("2026-09-26 22:08", "Eye icon all password fields; no emoji; fix change-password to succeed", "Done"),
    ("2026-09-26 22:15", "Use lucide.dev icons; save to SKILLS.md + STABLE_BASELINE.md", "Done"),
    ("2026-09-26 22:22", "Widen desktop password UI; eye in field; include symbol in password rules", "Done"),
    ("2026-09-26 22:25", "Restore student waiting room if teacher not in class; Lucide system icons", "Done"),
    ("2026-09-26 22:51", "Teacher guide Skip; careful chat bad-word filter; Lucide mic/cam icons", "Done"),
    ("2026-09-26 23:46", "Feedback still shows after submit; QA reschedule notify; bi-monthly cut-offs + payslip withdrawable", "Done"),
    ("2026-09-26 23:57", "Students max 2 classes / 1 hour per day when booking", "Done"),
    ("2026-09-27 00:04", "Teacher already withdraw → show 0.00 again (later superseded by keep-amount rule)", "Done"),
    ("2026-09-27 00:07", "Show Available to Withdraw (photo)", "Done"),
    ("2026-09-27 00:11", "Total Earnings header; Available to Withdraw instead of Payment Summary / net payable", "Done"),
    ("2026-09-27 00:17", "Keep amount after withdraw; label → Withdrawn (not zero)", "Done"),
    ("2026-09-27 00:21", "Payslip still Pending after withdraw", "Done"),
    ("2026-09-27 00:26", "Remove redundant Withdrawn beside Pending Earnings", "Done"),
    ("2026-09-27 00:27", "Payslip shows 1000 instead of 1140", "Done"),
    ("2026-09-27 00:30", "Undo salaries dispensed this cut-off for retest", "Done"),
    ("2026-09-27 00:45", "MariBank max daily withdraw PHP 50,000 note if exceed", "Done"),
    ("2026-09-27 00:53", "Min withdraw PHP 100 / rollover to next cut-off / unwithdrawn carries / PHP 50k daily max", "Done"),
    ("2026-09-27 01:18", "Post-assessment Plans: Register Now; retake email → already taken, check email", "Done"),
    ("2026-09-27 01:38", "Register first+last name then email; prefill from email link; no trial expire except email registered", "Done"),
    ("2026-09-27 01:43", "Generate Excel of prompts/bugs fixed or pending (first request)", "Done"),
    ("2026-09-27 01:53", "Credit expiry should follow longest plan expiry even after buying a shorter plan", "Done"),
    ("2026-09-27 01:54", "Clarify: longest expiry still applies OR days left should add up", "Done"),
    ("2026-09-27 02:03", "FIFO per-plan lots: earlier plan credits expire/use first before newer plan credits", "Done"),
    ("2026-09-27 02:14", "Booking Details should not be on the side; no jump-forward lessons; allow back/reschedule", "Done"),
    ("2026-09-27 02:28", "Regenerate Excel prompts & fixes tracker (Sep 26 9PM → now) matching Pre-Launch layout", "Done"),
]


def _summary_formats(wb):
    """Four dashboard cards matching Pre-Launch tracker colors."""
    specs = [
        ("#0B4F8A", "#D9ECFA", "#9CC7E8"),  # Total — blue
        ("#14532D", "#BBF7D0", "#86EFAC"),  # Completed — green
        ("#854D0E", "#FEF08A", "#FDE047"),  # Ongoing — yellow
        ("#0E7490", "#CFFAFE", "#67E8F9"),  # Scheduled — cyan
    ]
    out_fmts = []
    for fg, bg, border in specs:
        lbl = wb.add_format(
            {
                "bold": True,
                "font_size": 10,
                "font_color": fg,
                "bg_color": bg,
                "align": "center",
                "valign": "vcenter",
                "border": 1,
                "border_color": border,
            }
        )
        num = wb.add_format(
            {
                "bold": True,
                "font_size": 22,
                "font_color": fg,
                "bg_color": bg,
                "align": "center",
                "valign": "vcenter",
                "border": 1,
                "border_color": border,
            }
        )
        out_fmts.append((lbl, num))
    return out_fmts


def main():
    wb = xlsxwriter.Workbook(str(out))
    ws = wb.add_worksheet("Prompts & Fixes")

    title_fmt = wb.add_format(
        {
            "bold": True,
            "font_size": 18,
            "font_color": "#0B4F8A",
            "align": "left",
            "valign": "vcenter",
        }
    )
    sub_fmt = wb.add_format(
        {"font_size": 11, "font_color": "#475569", "align": "left", "valign": "vcenter"}
    )
    focus_box = wb.add_format(
        {
            "bold": True,
            "font_size": 11,
            "font_color": "#0B4F8A",
            "bg_color": "#E8F4FC",
            "align": "center",
            "valign": "vcenter",
            "border": 1,
            "border_color": "#9CC7E8",
            "text_wrap": True,
        }
    )
    header = wb.add_format(
        {
            "bold": True,
            "font_color": "#FFFFFF",
            "bg_color": "#1E3A5F",
            "align": "center",
            "valign": "vcenter",
            "border": 1,
            "text_wrap": True,
        }
    )
    cell = wb.add_format(
        {
            "font_size": 10,
            "font_color": "#1E293B",
            "align": "left",
            "valign": "vcenter",
            "border": 1,
            "border_color": "#CBD5E1",
            "text_wrap": True,
        }
    )
    cell_alt = wb.add_format(
        {
            "font_size": 10,
            "font_color": "#1E293B",
            "bg_color": "#F8FAFC",
            "align": "left",
            "valign": "vcenter",
            "border": 1,
            "border_color": "#CBD5E1",
            "text_wrap": True,
        }
    )
    cell_c = wb.add_format(
        {
            "font_size": 10,
            "font_color": "#1E293B",
            "align": "center",
            "valign": "vcenter",
            "border": 1,
            "border_color": "#CBD5E1",
        }
    )
    cell_c_alt = wb.add_format(
        {
            "font_size": 10,
            "font_color": "#1E293B",
            "bg_color": "#F8FAFC",
            "align": "center",
            "valign": "vcenter",
            "border": 1,
            "border_color": "#CBD5E1",
        }
    )
    done = wb.add_format(
        {
            "bold": True,
            "font_size": 10,
            "font_color": "#14532D",
            "bg_color": "#86EFAC",
            "align": "center",
            "valign": "vcenter",
            "border": 1,
        }
    )
    ongoing = wb.add_format(
        {
            "bold": True,
            "font_size": 10,
            "font_color": "#713F12",
            "bg_color": "#FDE047",
            "align": "center",
            "valign": "vcenter",
            "border": 1,
        }
    )
    scheduled = wb.add_format(
        {
            "bold": True,
            "font_size": 10,
            "font_color": "#0E7490",
            "bg_color": "#67E8F9",
            "align": "center",
            "valign": "vcenter",
            "border": 1,
        }
    )
    pending = wb.add_format(
        {
            "bold": True,
            "font_size": 10,
            "font_color": "#9A3412",
            "bg_color": "#FDBA74",
            "align": "center",
            "valign": "vcenter",
            "border": 1,
        }
    )
    pri_high = wb.add_format(
        {
            "bold": True,
            "font_size": 10,
            "font_color": "#7F1D1D",
            "align": "center",
            "valign": "vcenter",
            "border": 1,
            "border_color": "#CBD5E1",
        }
    )
    pri_med = wb.add_format(
        {
            "font_size": 10,
            "font_color": "#9A3412",
            "align": "center",
            "valign": "vcenter",
            "border": 1,
            "border_color": "#CBD5E1",
        }
    )
    pri_high_alt = wb.add_format(
        {
            "bold": True,
            "font_size": 10,
            "font_color": "#7F1D1D",
            "bg_color": "#F8FAFC",
            "align": "center",
            "valign": "vcenter",
            "border": 1,
            "border_color": "#CBD5E1",
        }
    )
    pri_med_alt = wb.add_format(
        {
            "font_size": 10,
            "font_color": "#9A3412",
            "bg_color": "#F8FAFC",
            "align": "center",
            "valign": "vcenter",
            "border": 1,
            "border_color": "#CBD5E1",
        }
    )

    ws.set_column("A:A", 10)
    ws.set_column("B:B", 10)
    ws.set_column("C:C", 64)
    ws.set_column("D:D", 20)
    ws.set_column("E:E", 12)
    ws.set_column("F:F", 10)
    ws.set_column("G:G", 12)
    ws.set_column("H:H", 12)
    ws.set_column("I:I", 40)

    now_lbl = datetime.now().strftime("%b %d, %Y %I:%M %p")
    ws.merge_range(
        "A1:I1",
        "RemoEd PH — Prompts & Bug Fixes Tracker (from Cursor session)",
        title_fmt,
    )
    ws.set_row(0, 30)
    ws.merge_range(
        "A2:I2",
        f"Updated {now_lbl} (UTC+8)  |  Window: Sep 26, 2026 9:00 PM → now  |  Focus: Platform prompts & stability fixes",
        sub_fmt,
    )
    ws.set_row(1, 20)

    total = len(rows)
    completed = sum(1 for r in rows if r["status"] == "Done")
    ongoing_n = sum(1 for r in rows if r["status"] == "Ongoing")
    scheduled_n = sum(1 for r in rows if r["status"] in ("Scheduled", "Pending"))

    summary_fmts = _summary_formats(wb)
    labels = [
        ("TOTAL TASKS", total),
        ("COMPLETED", completed),
        ("ONGOING", ongoing_n),
        ("SCHEDULED / PENDING", scheduled_n),
    ]
    spans = [("A4:B4", "A5:B5"), ("C4:D4", "C5:D5"), ("E4:F4", "E5:F5"), ("G4:H4", "G5:H5")]
    for (lab, num), (r4, r5), (lbl_fmt, num_fmt) in zip(labels, spans, summary_fmts):
        ws.merge_range(r4, lab, lbl_fmt)
        ws.merge_range(r5, num, num_fmt)
    ws.merge_range(
        "I4:I5",
        "All listed prompts in this window are Done.\nNo open Pending items at generation time.",
        focus_box,
    )
    ws.set_row(3, 18)
    ws.set_row(4, 32)

    headers = [
        "Task ID",
        "Owner",
        "Deliverables & Task Description",
        "Phase / Window",
        "Status",
        "Priority",
        "Start Date",
        "Target Date",
        "Notes & Focus Areas",
    ]
    for col, h in enumerate(headers):
        ws.write(6, col, h, header)
    ws.set_row(6, 34)

    status_fmt = {
        "Done": done,
        "Ongoing": ongoing,
        "Scheduled": scheduled,
        "Pending": pending,
    }
    for i, r in enumerate(rows):
        row = 7 + i
        ws.set_row(row, 52)
        alt = i % 2 == 1
        c = cell_alt if alt else cell
        cc = cell_c_alt if alt else cell_c
        ph = pri_high_alt if alt else pri_high
        pm = pri_med_alt if alt else pri_med
        ws.write(row, 0, r["id"], cc)
        ws.write(row, 1, r["owner"], cc)
        ws.write(row, 2, r["desc"], c)
        ws.write(row, 3, r["phase"], cc)
        ws.write(row, 4, r["status"], status_fmt.get(r["status"], cc))
        ws.write(row, 5, r["priority"], ph if r["priority"] == "High" else pm)
        ws.write(row, 6, r["start"], cc)
        ws.write(row, 7, r["target"], cc)
        ws.write(row, 8, r["notes"], c)

    leg_row = 7 + len(rows) + 1
    ws.write(leg_row, 0, "Legend:", wb.add_format({"bold": True, "font_size": 10}))
    ws.write(leg_row, 1, "Done", done)
    ws.write(leg_row, 2, "Ongoing", ongoing)
    ws.write(leg_row, 3, "Scheduled", scheduled)
    ws.write(leg_row, 4, "Pending", pending)
    ws.write(leg_row + 1, 0, "Generated:", cell)
    ws.write(leg_row + 1, 1, datetime.now().strftime("%Y-%m-%d %H:%M PHT"), cell)
    ws.write(
        leg_row + 2,
        0,
        "Source:",
        cell,
    )
    ws.merge_range(
        leg_row + 2,
        1,
        leg_row + 2,
        8,
        "Cursor agent transcript prompts from Sep 26 9:00 PM PHT onward (meta/briefly-inform prompts omitted).",
        cell,
    )

    ws2 = wb.add_worksheet("Raw Prompt Log")
    ws2.write_row(0, 0, ["#", "Timestamp (UTC+8)", "User Prompt (summary)", "Status"], header)
    ws2.set_column("A:A", 5)
    ws2.set_column("B:B", 22)
    ws2.set_column("C:C", 95)
    ws2.set_column("D:D", 14)
    for i, (ts, prompt, st) in enumerate(raw, 1):
        ws2.write(i, 0, i, cell_c)
        ws2.write(i, 1, ts, cell_c)
        ws2.write(i, 2, prompt, cell)
        st_fmt = done if st == "Done" else ongoing if st == "Ongoing" else pending
        ws2.write(i, 3, st, st_fmt if "Done" in st or st in ("Ongoing", "Pending") else cell_c)

    wb.close()
    print(str(out))
    print(f"Tasks={total} Completed={completed} Ongoing={ongoing_n} Scheduled/Pending={scheduled_n}")


if __name__ == "__main__":
    main()
