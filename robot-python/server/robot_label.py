"""The robot's display name (사용자 이름), shown next to its address in 로봇 찾기.

Set from the USB stick (`사용자=3조 김민수` in eduino/wifi.txt, usb_setup.py runs as
root) and kept in /etc/eduino/robot-name.txt, which the console servers read. A
classroom of identical robots then lists as names people recognise.
"""

import os
import re

LABEL_FILE = os.environ.get("EDUINO_LABEL_FILE", "/etc/eduino/robot-name.txt")
MAX_LEN = 24


def clean(text):
    """One line of plain text, at most MAX_LEN characters (no control characters, no markup)."""
    text = re.sub(r"[\x00-\x1f\x7f<>]", " ", text or "")
    return re.sub(r"\s+", " ", text).strip()[:MAX_LEN]


def read_label():
    try:
        with open(LABEL_FILE, encoding="utf-8") as f:
            return clean(f.read(512))
    except (OSError, UnicodeDecodeError):
        return ""


def write_label(text):
    """Keep `text` as the robot's name (root only); returns the name kept, '' to clear it."""
    name = clean(text)
    folder = os.path.dirname(LABEL_FILE)
    os.makedirs(folder, mode=0o755, exist_ok=True)
    tmp = LABEL_FILE + ".new"
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | getattr(os, "O_NOFOLLOW", 0), 0o644)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(name + "\n")
    os.replace(tmp, LABEL_FILE)
    return name
