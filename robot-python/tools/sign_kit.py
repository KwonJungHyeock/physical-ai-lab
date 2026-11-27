#!/usr/bin/env python3
"""Sign a USB kit on the PC that holds the signing key — Python only, no OpenSSL, no repository needed.

    python sign_kit.py eduino_usb.zip --key C:\\Users\\USER\\keys\\eduino-kit-signing.pem
    python sign_kit.py eduino_usb.zip --key <키> --put server.py      # a signed kit with a newer server.py

--put FILE (any number): the console file of that name (robot_console/<name>, e.g. server.py) is replaced
by FILE and the console gets a newer VERSION (`YYYYMMDD-HHMMSS-update`, UTC), so a robot updates from the
stick (kit_update.py takes only a newer VERSION). Works on an already signed kit: it is signed again.

A kit made without a key (make_usb_kit.py with no --key) has eduino/robot_console.zip but no
eduino/robot_console.zip.sig. This adds that signature (Ed25519 of the zip's bytes, the same as
make_usb_kit.py makes with `openssl pkeyutl -sign -rawin`) and writes eduino_usb.signed.zip beside it.

The key must be the pair of the public key the robots already have (robot_console/kit_signing_public.pem,
read from inside the kit): any other key is refused, since robots would refuse its kits. The key is only
read; nothing of it is printed or written anywhere.

Ed25519 here is the reference algorithm of RFC 8032 (section 5.1, the code of section 6), standard library only.
"""

import argparse
import base64
import hashlib
import io
import os
import sys
import time
import zipfile

# --------------------------------------------------------------------------- #
# Ed25519 (RFC 8032)                                                          #
# --------------------------------------------------------------------------- #
P = 2 ** 255 - 19
D = -121665 * pow(121666, P - 2, P) % P
Q = 2 ** 252 + 27742317777372353535851937790883648493
SQRT_M1 = pow(2, (P - 1) // 4, P)


def _sha512(data):
    return hashlib.sha512(data).digest()


def _add(a, b):
    x = (a[1] - a[0]) * (b[1] - b[0]) % P
    y = (a[1] + a[0]) * (b[1] + b[0]) % P
    c = 2 * a[3] * b[3] * D % P
    d = 2 * a[2] * b[2] % P
    e, f, g, h = y - x, d - c, d + c, y + x
    return (e * f % P, g * h % P, f * g % P, e * h % P)


def _mul(s, pt):
    acc = (0, 1, 1, 0)
    while s > 0:
        if s & 1:
            acc = _add(acc, pt)
        pt = _add(pt, pt)
        s >>= 1
    return acc


def _recover_x(y, sign):
    x2 = (y * y - 1) * pow(D * y * y + 1, P - 2, P)
    if x2 == 0:
        return 0
    x = pow(x2, (P + 3) // 8, P)
    if (x * x - x2) % P != 0:
        x = x * SQRT_M1 % P
    if (x * x - x2) % P != 0:
        raise ValueError("not a point")
    if (x & 1) != sign:
        x = P - x
    return x


_GY = 4 * pow(5, P - 2, P) % P
_GX = _recover_x(_GY, 0)
G = (_GX, _GY, 1, _GX * _GY % P)


def _compress(pt):
    zinv = pow(pt[2], P - 2, P)
    x, y = pt[0] * zinv % P, pt[1] * zinv % P
    return int.to_bytes(y | ((x & 1) << 255), 32, "little")


def _expand(seed):
    h = _sha512(seed)
    a = int.from_bytes(h[:32], "little")
    a &= (1 << 254) - 8
    a |= 1 << 254
    return a, h[32:]


def public_of(seed):
    a, _ = _expand(seed)
    return _compress(_mul(a, G))


def sign(seed, msg):
    a, prefix = _expand(seed)
    pub = _compress(_mul(a, G))
    r = int.from_bytes(_sha512(prefix + msg), "little") % Q
    big_r = _compress(_mul(r, G))
    h = int.from_bytes(_sha512(big_r + pub + msg), "little") % Q
    return big_r + int.to_bytes((r + h * a) % Q, 32, "little")


# --------------------------------------------------------------------------- #
# PEM                                                                         #
# --------------------------------------------------------------------------- #
PRIVATE_DER = bytes.fromhex("302e020100300506032b657004220420")   # PKCS#8 Ed25519, then the 32-byte seed
PUBLIC_DER = bytes.fromhex("302a300506032b6570032100")            # SubjectPublicKeyInfo Ed25519, then 32 bytes


def pem_body(text, label):
    begin, end = f"-----BEGIN {label}-----", f"-----END {label}-----"
    if begin not in text or end not in text:
        return None
    return base64.b64decode("".join(text.split(begin, 1)[1].split(end, 1)[0].split()))


def read_seed(path):
    with open(path, encoding="ascii", errors="replace") as f:
        der = pem_body(f.read(), "PRIVATE KEY")
    if not der or len(der) != 48 or not der.startswith(PRIVATE_DER):
        sys.exit("서명 키 파일이 Ed25519 비밀 키(PEM, -----BEGIN PRIVATE KEY-----)가 아니에요.")
    return der[16:]


def read_public(pem_bytes):
    der = pem_body(pem_bytes.decode("ascii", "replace"), "PUBLIC KEY")
    if not der or len(der) != 44 or not der.startswith(PUBLIC_DER):
        sys.exit("키트 안의 공개 키(kit_signing_public.pem)를 읽지 못했어요.")
    return der[12:]


def replace_files(rc, paths):
    """robot_console.zip with robot_console/<name> replaced by each file, and a newer VERSION."""
    new = {}
    for path in paths:
        name = os.path.basename(path)
        with open(path, "rb") as f:
            new["robot_console/" + name] = f.read()
    version = time.strftime("%Y%m%d-%H%M%S", time.gmtime()) + "-update"
    out = io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(rc)) as old, zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        missing = [n for n in new if n not in old.namelist()]
        if missing:
            sys.exit(f"키트의 콘솔에 없는 파일이에요: {', '.join(m.split('/', 1)[1] for m in missing)}")
        for info in old.infolist():
            data = new.get(info.filename)
            if info.filename == "robot_console/VERSION":
                data = (version + "\n").encode()
            if data is None:
                z.writestr(info, old.read(info.filename))
            else:
                fresh = zipfile.ZipInfo(info.filename, time.localtime()[:6])
                fresh.external_attr, fresh.compress_type = info.external_attr, zipfile.ZIP_DEFLATED
                z.writestr(fresh, data)
    for name in new:
        print(f"  바꿈: {name.split('/', 1)[1]} ({len(new[name])} 바이트)")
    return out.getvalue(), version


def main():
    ap = argparse.ArgumentParser(description="USB 키트 서명 (서명 키가 있는 PC 에서)")
    ap.add_argument("kit", help="서명하지 않은 eduino_usb.zip")
    ap.add_argument("--key", required=True, help="서명 키 (예: C:\\Users\\USER\\keys\\eduino-kit-signing.pem)")
    ap.add_argument("-o", "--out", help="만들 파일 (기본: eduino_usb.signed.zip, 키트 옆)")
    ap.add_argument("--put", action="append", default=[], help="콘솔 파일 바꾸기 (예: server.py), 여러 번 가능")
    args = ap.parse_args()

    with zipfile.ZipFile(args.kit) as kit:
        names = kit.namelist()
        if "eduino/robot_console.zip" not in names:
            sys.exit("USB 키트가 아니에요 (eduino/robot_console.zip 이 없어요).")
        rc = kit.read("eduino/robot_console.zip")
        with zipfile.ZipFile(io.BytesIO(rc)) as console:
            pub = read_public(console.read("robot_console/kit_signing_public.pem"))
            version = console.read("robot_console/VERSION").decode().strip()
        if args.put:
            rc, version = replace_files(rc, args.put)
        seed = read_seed(args.key)
        if public_of(seed) != pub:
            sys.exit("이 키는 로봇이 믿는 공개 키와 짝이 아니에요. 로봇이 받아들이지 않을 키트라 서명하지 않았어요.")
        sig = sign(seed, rc)
        out = args.out or os.path.join(os.path.dirname(os.path.abspath(args.kit)), "eduino_usb.signed.zip")
        with zipfile.ZipFile(out, "w") as z:
            for info in kit.infolist():
                if info.filename == "eduino/robot_console.zip.sig":
                    continue
                z.writestr(info, rc if info.filename == "eduino/robot_console.zip" else kit.read(info.filename))
            info = zipfile.ZipInfo("eduino/robot_console.zip.sig", kit.getinfo("eduino/robot_console.zip").date_time)
            info.external_attr = 0o644 << 16
            z.writestr(info, sig)
    print(f"서명했어요: {out}")
    print(f"  콘솔 버전 {version} · 콘솔 SHA-256 {hashlib.sha256(rc).hexdigest()[:16]}")
    print("  이 파일 이름을 eduino_usb.zip 으로 바꿔 로봇 설치 도구 옆에 두거나 GitHub 릴리스에 올려요.")


if __name__ == "__main__":
    main()
