"""Wait for the Windows Open dialog and select all staged PPTX files."""
from __future__ import annotations

import sys
import time
from pathlib import Path

from pywinauto import Desktop
from pywinauto.keyboard import send_keys

STAGE = Path(
    r"d:\Users\Window11\Documents\RemoEd-Jean\RemoEdPH\docs\lesson-references\drive-upload-stage"
)


def find_open_dialog(timeout: float = 25.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        for w in Desktop(backend="uia").windows():
            try:
                title = w.window_text()
            except Exception:
                continue
            if title in ("Open", "File Upload", "Choose File to Upload"):
                return w
            # Chrome/Electron sometimes: "Open" or localized
            if title.lower().startswith("open"):
                return w
        time.sleep(0.35)
    return None


def main() -> int:
    print("waiting for Open dialog…", flush=True)
    dlg = find_open_dialog()
    if dlg is None:
        print("NO_DIALOG", flush=True)
        return 2
    print("found:", dlg.window_text(), flush=True)
    dlg.set_focus()
    time.sleep(0.4)

    # Focus address / filename area: Ctrl+L often works in Win11 Open dialog
    send_keys("^l")
    time.sleep(0.3)
    send_keys(str(STAGE), with_spaces=True)
    send_keys("{ENTER}")
    time.sleep(1.0)

    # Select all files in the folder (only our PPTX files)
    dlg.set_focus()
    time.sleep(0.2)
    send_keys("^a")
    time.sleep(0.3)
    send_keys("{ENTER}")
    print("submitted", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
