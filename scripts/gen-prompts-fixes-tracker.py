# -*- coding: utf-8 -*-
"""Generate RemoEd PH prompts/fixes Excel tracker (Sep 26 9PM → now)."""
import xlsxwriter
from datetime import datetime
from pathlib import Path

out = Path(__file__).resolve().parents[1] / "docs" / "RemoEdPH-Prompts-Fixes-Tracker-2026-09-26-9PM.xlsx"
out.parent.mkdir(parents=True, exist_ok=True)

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
        notes="Lesson creation / remoed-lesson-creation skill",
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
        notes="Password reset UX shortened",
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
        notes="Student/profile form validation",
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
        notes="Contact fields aligned",
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
        notes="Change-password / reset UI",
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
        notes="password-toggle.js",
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
        notes="lucide-icons.js catalog",
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
        notes="Desktop layout polish",
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
        notes="student-class-wait.js; STABLE_BASELINE",
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
        notes="Live classroom chat + media pills",
    ),
    dict(
        id="TSK-011",
        owner="Jean",
        desc="Hide Give Feedback after submit; QA issue → notify students to reschedule; bi-monthly cut-offs (1–15 salary 15th; 16–EOM salary EOM); payslip withdrawable amount",
        phase="Phase 1 (Sep 26–27)",
        status="Done",
        priority="High",
        start="2026-09-26",
        target="2026-09-27",
        notes="Feedback + QA notify + payroll periods",
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
        notes="DAILY_CLASS_LIMIT in studentBookSlotService",
    ),
    dict(
        id="TSK-013",
        owner="Jean",
        desc="Teaching Fee: after withdraw keep cut-off amount; label → Withdrawn (not zero); Total Earnings header; Available to Withdraw wallet",
        phase="Phase 1 (Sep 26–27)",
        status="Done",
        priority="High",
        start="2026-09-27",
        target="2026-09-27",
        notes="teacher-service-fee.html UX iterations",
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
        notes="Payslip lifecycle mapping",
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
        notes="Teaching Fee wallet cleanup",
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
        notes="Payslip totals fix",
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
        notes="scripts/undo-cutoff-salary-dispense.js (test DB)",
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
        notes="Teaching Fee + withdraw modal",
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
        notes="payrollWithdrawService + dispense carry-forward",
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
        notes="index.html + assessment-status API",
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
        notes="student-register.html + auth trial resolve",
    ),
]

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
    ("2026-09-27 00:04", "After withdraw show 0.00 (later superseded)", "Done → revised"),
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
    ("2026-09-27 01:37–01:38", "Register first+last name then email; prefill from email link; no trial expire except email registered", "Done"),
]


def main():
    wb = xlsxwriter.Workbook(str(out))
    ws = wb.add_worksheet("Prompts & Fixes")

    title_fmt = wb.add_format(
        {"bold": True, "font_size": 18, "font_color": "#0F2744", "align": "center", "valign": "vcenter"}
    )
    sub_fmt = wb.add_format(
        {"font_size": 11, "font_color": "#334155", "align": "center", "valign": "vcenter"}
    )
    summary_box = wb.add_format(
        {
            "bold": True,
            "font_size": 12,
            "font_color": "#0B4F8A",
            "bg_color": "#D9ECFA",
            "align": "center",
            "valign": "vcenter",
            "border": 1,
            "border_color": "#9CC7E8",
        }
    )
    summary_num = wb.add_format(
        {
            "bold": True,
            "font_size": 20,
            "font_color": "#0B4F8A",
            "bg_color": "#D9ECFA",
            "align": "center",
            "valign": "vcenter",
            "border": 1,
            "border_color": "#9CC7E8",
        }
    )
    summary_lbl = wb.add_format(
        {
            "font_size": 10,
            "font_color": "#334155",
            "bg_color": "#D9ECFA",
            "align": "center",
            "valign": "vcenter",
            "border": 1,
            "border_color": "#9CC7E8",
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

    ws.set_column("A:A", 10)
    ws.set_column("B:B", 10)
    ws.set_column("C:C", 62)
    ws.set_column("D:D", 20)
    ws.set_column("E:E", 12)
    ws.set_column("F:F", 10)
    ws.set_column("G:G", 12)
    ws.set_column("H:H", 12)
    ws.set_column("I:I", 36)

    ws.merge_range("A1:I1", "RemoEd PH — Prompts & Bug Fixes Tracker (from Cursor session)", title_fmt)
    ws.set_row(0, 28)
    ws.merge_range(
        "A2:I2",
        "Window: Sep 26, 2026 9:00 PM → Sep 27, 2026 ~1:40 AM (UTC+8)  ·  Source: agent chat prompts/fixes only",
        sub_fmt,
    )
    ws.set_row(1, 20)

    total = len(rows)
    completed = sum(1 for r in rows if r["status"] == "Done")
    ongoing_n = sum(1 for r in rows if r["status"] == "Ongoing")
    scheduled_n = sum(1 for r in rows if r["status"] == "Scheduled")

    labels = [
        ("Total Tasks", total),
        ("Completed", completed),
        ("Ongoing", ongoing_n),
        ("Scheduled", scheduled_n),
    ]
    spans = [("A4:B4", "A5:B5"), ("C4:D4", "C5:D5"), ("E4:F4", "E5:F5"), ("G4:H4", "G5:H5")]
    for (lab, num), (r4, r5) in zip(labels, spans):
        ws.merge_range(r4, lab, summary_lbl)
        ws.merge_range(r5, num, summary_num)
    ws.merge_range("I4:I5", "Focus: Platform prompts & stability fixes", summary_box)
    ws.set_row(3, 18)
    ws.set_row(4, 28)

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
    ws.set_row(6, 32)

    status_fmt = {"Done": done, "Ongoing": ongoing, "Scheduled": scheduled}
    for i, r in enumerate(rows):
        row = 7 + i
        ws.set_row(row, 48)
        ws.write(row, 0, r["id"], cell_c)
        ws.write(row, 1, r["owner"], cell_c)
        ws.write(row, 2, r["desc"], cell)
        ws.write(row, 3, r["phase"], cell_c)
        ws.write(row, 4, r["status"], status_fmt.get(r["status"], cell_c))
        ws.write(row, 5, r["priority"], pri_high if r["priority"] == "High" else pri_med)
        ws.write(row, 6, r["start"], cell_c)
        ws.write(row, 7, r["target"], cell_c)
        ws.write(row, 8, r["notes"], cell)

    leg_row = 7 + len(rows) + 1
    ws.write(leg_row, 0, "Legend:", wb.add_format({"bold": True}))
    ws.write(leg_row, 1, "Done", done)
    ws.write(leg_row, 2, "Ongoing", ongoing)
    ws.write(leg_row, 3, "Scheduled", scheduled)
    ws.write(leg_row + 1, 0, "Generated:", cell)
    ws.write(leg_row + 1, 1, datetime.now().strftime("%Y-%m-%d %H:%M"), cell)

    ws2 = wb.add_worksheet("Raw Prompt Log")
    ws2.write_row(0, 0, ["#", "Timestamp (UTC+8)", "User Prompt (summary)", "Status"], header)
    ws2.set_column("A:A", 5)
    ws2.set_column("B:B", 22)
    ws2.set_column("C:C", 90)
    ws2.set_column("D:D", 14)
    for i, (ts, prompt, st) in enumerate(raw, 1):
        ws2.write(i, 0, i, cell_c)
        ws2.write(i, 1, ts, cell_c)
        ws2.write(i, 2, prompt, cell)
        ws2.write(i, 3, st, done if "Done" in st else ongoing)

    wb.close()
    print(str(out))
    print(f"Tasks={total} Completed={completed} Ongoing={ongoing_n} Scheduled={scheduled_n}")


if __name__ == "__main__":
    main()
