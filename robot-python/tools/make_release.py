"""Put together the delivery bundle: the PC simulator, the robot USB stick, the two guides and the class PDFs.

Development tool, not run on the robot. Build the pieces first:

    sh desktop-go/build.sh                          # desktop-go/dist/Physical AI 시뮬레이터.exe
    (cd web-typescript && npm run build:robot)              # screens for the robot (build.sh does this too)
    (cd web-typescript && node tools/build/guides.mjs)      # manuals/*/…pdf
    python3 robot-python/tools/make_release.py -o dist # -> dist/PhysicalAI-배포-<date>/ and one .zip per part

The bundle:

    PhysicalAI-배포-<date>/
      읽어보세요.txt
      1-시뮬레이터 (Windows PC)/   Physical AI 시뮬레이터.exe, 읽어보세요.txt
      2-로봇 USB/                  eduino/ — copy this folder to the top of a USB stick as it is
      3-사용 설명서/               시뮬레이터 사용 매뉴얼.pdf, 교사용 교육 가이드라인.pdf
      4-수업 자료 PDF/             이론 교재 · OX 문항지 · 객관식 문항지 (학문 1~8), 전체 문항집, 용어 사전
"""

import argparse
import datetime
import os
import shutil
import subprocess
import sys
import tempfile
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
EXE = os.path.join(REPO, "desktop-go", "dist", "Physical AI 시뮬레이터.exe")
EXE_README = os.path.join(REPO, "desktop-go", "README.txt")
GUIDES = [
    os.path.join(REPO, "manuals", "simulator", "시뮬레이터 사용 매뉴얼.pdf"),
    os.path.join(REPO, "manuals", "course", "교사용 교육 가이드라인.pdf"),
]
MATERIALS = os.path.join(REPO, "web-typescript", "public", "materials")
CATS = ["기초 로봇공학", "기구학 & 역기구학", "미분기구학 · 궤적 생성", "로봇 동역학",
        "로봇 제어공학", "동작 계획", "로봇 비전 · 인식", "로봇 학습"]
KINDS = [("theory", "이론 교재"), ("ox", "OX 문항지"), ("mc", "객관식 문항지")]

PARTS = ("1-시뮬레이터 (Windows PC)", "2-로봇 USB", "3-사용 설명서", "4-수업 자료 PDF")

TOP_README = """Physical AI 학습 프로그램 — 배포 묶음 ({date})
==================================================

1-시뮬레이터 (Windows PC)
   Physical AI 시뮬레이터.exe 를 더블클릭하면 시뮬레이터가 열려요. 설치 · 인터넷이 필요 없어요.
   처음 한 번 "Windows의 PC 보호" 가 나오면 [추가 정보] → [실행].
   이 폴더째 학생 PC 바탕화면에 복사해 쓰면 돼요.

2-로봇 USB
   안의 eduino 폴더를 USB 메모리 맨 위에 그대로 복사하고, eduino/wifi.txt 에
   교실 Wi-Fi 이름 · 비밀번호 · 사용자 이름을 적어 로봇에 꽂아요.
   로봇마다 처음 한 번은 로봇 터미널에서 설치 명령 한 줄 (eduino/읽어보세요.txt 의 A).
   그 뒤로는 꽂기만 하면 돼요: Wi-Fi 를 바꾸고, 새 키트면 로봇이 스스로 업데이트해요.

3-사용 설명서
   시뮬레이터 사용 매뉴얼.pdf   — 설치부터 화면, 코딩, 실제 로봇 연결까지 그림으로
   교사용 교육 가이드라인.pdf   — 28차시 수업 운영, 평가, 자료실 활용

4-수업 자료 PDF
   학문 1~8 의 이론 교재 · OX 문항지 · 객관식 문항지, 전체 문항집, 용어 사전.
   시뮬레이터의 [교육] → [자료실] 에서도 같은 파일을 받을 수 있어요.
"""


def need(path):
    if not os.path.exists(path):
        sys.exit(f"없는 파일: {os.path.relpath(path, REPO)} (모듈 맨 위의 만드는 순서를 보세요)")
    return path


def usb_folder(dest):
    """Make the USB kit with make_usb_kit.py and unpack its eduino/ folder into dest."""
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run([sys.executable, os.path.join(HERE, "make_usb_kit.py"), "-o", tmp], check=True)
        with zipfile.ZipFile(os.path.join(tmp, "eduino_usb.zip")) as z:
            z.extractall(dest)
    return os.path.join(dest, "eduino")


def zip_dir(src, out):
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for root, dirs, files in os.walk(src):
            dirs.sort()
            for name in sorted(files):
                path = os.path.join(root, name)
                z.write(path, os.path.relpath(path, os.path.dirname(src)))
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("-o", "--out", default=".", help="the folder to write the bundle into")
    args = ap.parse_args()
    date = datetime.date.today().strftime("%Y-%m")
    root = os.path.join(os.path.abspath(args.out), f"PhysicalAI-배포-{date}")
    if os.path.exists(root):
        shutil.rmtree(root)
    sim, usb, guides, mats = (os.path.join(root, p) for p in PARTS)
    for d in (sim, usb, guides, mats):
        os.makedirs(d)

    with open(os.path.join(root, "읽어보세요.txt"), "w", encoding="utf-8-sig", newline="\r\n") as f:
        f.write(TOP_README.format(date=date))
    shutil.copy2(need(EXE), sim)
    shutil.copy2(need(EXE_README), os.path.join(sim, "읽어보세요.txt"))
    usb_folder(usb)
    for g in GUIDES:
        shutil.copy2(need(g), guides)
    for kind, label in KINDS:
        sub = os.path.join(mats, label)
        os.makedirs(sub)
        for i, cat in enumerate(CATS, 1):
            shutil.copy2(need(os.path.join(MATERIALS, f"{kind}-{i}.pdf")), os.path.join(sub, f"{i}. {cat} — {label}.pdf"))
    shutil.copy2(need(os.path.join(MATERIALS, "questions-all.pdf")), os.path.join(mats, "전체 문항집 (560문항).pdf"))
    shutil.copy2(need(os.path.join(MATERIALS, "glossary.pdf")), os.path.join(mats, "로봇공학 용어 사전.pdf"))

    # One zip per part, so each can be sent or downloaded on its own, and one for everything.
    for part in PARTS:
        out = zip_dir(os.path.join(root, part), os.path.join(args.out, f"{part}.zip"))
        print(f"{os.path.basename(out)}  ({os.path.getsize(out) // 1024} KB)")
    out = zip_dir(root, os.path.join(args.out, f"{os.path.basename(root)}.zip"))
    print(f"{os.path.basename(out)}  ({os.path.getsize(out) // 1024} KB)")
    print(root)


if __name__ == "__main__":
    main()
