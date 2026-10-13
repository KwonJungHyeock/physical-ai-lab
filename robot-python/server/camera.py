"""Kit camera for the robot console: live JPEG frames and on-robot colour detection.

Optional part of the server. It uses OpenCV (cv2) and numpy when the robot has
them (RDK OS ships OpenCV); without them the camera routes answer 503 and
everything else keeps working. The detection is the official AI Kit colour
program (aikit_V2 AiKit_280PI/scripts/aikit_color.py), run here on the robot:

    ArUco DICT_6X6_250 markers id 1, 2 -> centre = mid-point, ratio = 220 / (|du| + |dv|)
    BGR -> HSV, the official ranges -> largest blob per colour inside the size filter
    x = (v - cv) * ratio + board x,  y = (u - cu) * ratio + board y   (robot frame, mm)

The same numbers as web-typescript/src/engine/vision/color.ts, so the browser and the robot
agree on what the camera sees.
"""

import math
import os
import threading
import time

os.environ.setdefault("OPENCV_LOG_LEVEL", "ERROR")   # keep the terminal readable while looking for the camera
try:
    import cv2
    import numpy as np
except ImportError:          # no OpenCV on this machine: camera features off
    cv2 = None
    np = None

# Official HSV ranges, OpenCV units (H 0-180) [aikit_color.py], and the colour each one means.
OFFICIAL_HSV = [
    ("노랑", (11, 85, 70), (59, 255, 245)),
    ("빨강", (0, 43, 46), (8, 255, 255)),
    ("초록", (35, 43, 35), (90, 255, 255)),
    ("파랑", (100, 43, 46), (124, 255, 255)),
    ("파랑", (78, 43, 46), (99, 255, 255)),     # official "cyan", sorted with blue
]
CAL_BOARD = (159.8, 0.0)       # calibration board centre, robot frame mm (web-typescript/src/engine/simulator/board.ts)
MARKER_SPAN_MM = 220.0
WORK_WIDTH = 640               # frames are processed at the official kit's 640 px width


class Camera:
    """Keeps the newest frame of one camera, reading only while someone is looking."""

    def __init__(self, source, log=print):
        # "auto" (first /dev/video* that gives a picture), a device index, or an image
        # file path (to try the console without a camera); None = no camera
        self.source = source
        self.log = log
        self.lock = threading.Lock()
        self.frame = None
        self.frame_time = 0.0
        self.wanted = 0.0
        self.error = "" if cv2 is not None else "이 로봇에 OpenCV(cv2)가 없어 카메라를 쓸 수 없어요."
        self.thread = None

    @property
    def available(self):
        return cv2 is not None and self.source is not None

    def _open(self):
        """Open the capture device. "auto" tries /dev/video0..9 (on the RDK X5 the USB
        camera is often not number 0) and keeps the first one that delivers a frame."""
        indices = range(10) if self.source == "auto" else [self.source]
        for i in indices:
            cap = cv2.VideoCapture(i)
            if cap.isOpened():
                self._tune(cap)
                ok, _ = cap.read()
                if ok:
                    if self.source == "auto":
                        self.log(f"카메라: /dev/video{i} 을 씁니다.")
                        self.source = i
                    return cap
            cap.release()
        if self.source == "auto":
            raise RuntimeError("카메라를 찾지 못했어요. USB 연결을 확인해 주세요.")
        raise RuntimeError(f"카메라 {self.source}번을 열 수 없어요. USB 연결을 확인하거나 --camera auto 로 켜 주세요.")

    @staticmethod
    def _tune(cap):
        """Keep the picture current: the driver holds several frames by default, so a slow reader
        sees the past. One frame in the queue; MJPG at 640 x 480 (what the pipeline uses) so the
        camera sends little and decoding keeps up. A camera that cannot do one of these ignores it."""
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*"MJPG"))
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, WORK_WIDTH)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, WORK_WIDTH * 3 // 4)

    def _reader(self):
        cap = None
        try:
            if isinstance(self.source, str) and self.source != "auto":
                still = cv2.imread(self.source)
                if still is None:
                    raise RuntimeError(f"그림 파일을 읽을 수 없어요: {self.source}")
            else:
                cap = self._open()
            while time.time() - self.wanted < 5.0:      # stop reading 5 s after the last viewer
                if cap is None:
                    img = still.copy()
                    time.sleep(0.1)
                else:
                    ok, img = cap.read()
                    if not ok:
                        raise RuntimeError("카메라에서 영상을 받지 못했어요.")
                with self.lock:
                    self.frame, self.frame_time, self.error = img, time.time(), ""
        except Exception as exc:                   # reported to the console, retried on the next request
            with self.lock:
                self.error = str(exc)
        finally:
            if cap is not None:
                cap.release()

    def latest(self, timeout=6.0):
        """Newest frame (BGR, 640 px wide), or raises RuntimeError with a message for the console."""
        if not self.available:
            raise RuntimeError(self.error or "카메라가 꺼져 있어요 (--camera none).")
        self.wanted = time.time()
        if self.thread is None or not self.thread.is_alive():
            with self.lock:
                self.frame, self.error = None, ""
            self.thread = threading.Thread(target=self._reader, daemon=True)
            self.thread.start()
        end = time.time() + timeout
        while time.time() < end:
            with self.lock:
                if self.frame is not None and time.time() - self.frame_time < 1.0:
                    img = self.frame
                    break
                if self.error:
                    raise RuntimeError(self.error)
            time.sleep(0.02)
        else:
            raise RuntimeError("카메라 영상이 오지 않아요.")
        h, w = img.shape[:2]
        if w != WORK_WIDTH:
            img = cv2.resize(img, (WORK_WIDTH, round(h * WORK_WIDTH / w)), interpolation=cv2.INTER_AREA)
        return img

    def jpeg(self):
        ok, buf = cv2.imencode(".jpg", self.latest(), [cv2.IMWRITE_JPEG_QUALITY, 75])
        if not ok:
            raise RuntimeError("영상을 JPEG 로 바꾸지 못했어요.")
        return buf.tobytes()


class CameraSet:
    """Every camera of the robot, numbered 0, 1, … (the kit camera and the hand camera, when both are in).

    `spec`: None (cameras off), "auto" (every /dev/video* that gives a picture, found in the
    background at start), or a list of device numbers / image file paths. A camera is only read
    while someone is looking at it."""

    MAX = 4

    def __init__(self, spec, log=print):
        self.log = log
        self.cams = []
        self.searching = False
        if spec is None:
            self.error = "카메라가 꺼져 있어요 (--camera none)."
        elif cv2 is None:
            self.error = "이 로봇에 OpenCV(cv2)가 없어 카메라를 쓸 수 없어요."
        elif spec == "auto":
            self.error = ""
            self.searching = True
            threading.Thread(target=self._discover, daemon=True).start()
        else:
            self.error = ""
            self.cams = [Camera(s, log) for s in spec]

    def _discover(self):
        """Which /dev/video* give a picture (a USB camera often has a second, picture-less node)."""
        found = []
        try:
            for i in range(10):
                if len(found) >= self.MAX:
                    break
                if os.path.exists("/dev") and not os.path.exists(f"/dev/video{i}"):
                    continue
                cap = cv2.VideoCapture(i)
                try:
                    if cap.isOpened():
                        Camera._tune(cap)
                        ok, _ = cap.read()
                        if ok:
                            found.append(i)
                finally:
                    cap.release()
        finally:
            self.cams = [Camera(i, self.log) for i in found]
            self.searching = False
            if found:
                self.log("카메라: " + ", ".join(f"{n + 1}번 = /dev/video{i}" for n, i in enumerate(found)))
            else:
                self.error = "카메라를 찾지 못했어요. USB 연결을 확인하고 서버를 다시 켜 주세요."
                self.log("카메라: 찾지 못했어요.")

    @property
    def available(self):
        return bool(self.cams) or self.searching

    @property
    def count(self):
        return len(self.cams)

    def get(self, n=0):
        if self.searching:
            end = time.time() + 15
            while self.searching and time.time() < end:
                time.sleep(0.05)
        if not self.cams:
            raise RuntimeError(self.error or "카메라가 없어요.")
        if not 0 <= n < len(self.cams):
            raise RuntimeError(f"카메라 {n + 1}번이 없어요 (연결된 카메라 {len(self.cams)}대).")
        return self.cams[n]

    def latest(self, n=0):
        return self.get(n).latest()

    def jpeg(self, n=0):
        return self.get(n).jpeg()


def _markers(img):
    """ArUco DICT_6X6_250 marker centres by id; handles both OpenCV 4.7+ and older aruco APIs."""
    aruco = cv2.aruco
    dictionary = aruco.getPredefinedDictionary(aruco.DICT_6X6_250)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    if hasattr(aruco, "ArucoDetector"):
        corners, ids, _ = aruco.ArucoDetector(dictionary, aruco.DetectorParameters()).detectMarkers(gray)
    else:
        corners, ids, _ = aruco.detectMarkers(gray, dictionary, parameters=aruco.DetectorParameters_create())
    found = {}
    if ids is not None:
        for c, i in zip(corners, ids.flatten()):
            pts = c.reshape(-1, 2)
            found[int(i)] = {
                "u": float(pts[:, 0].mean()),
                "v": float(pts[:, 1].mean()),
                "box": [float(pts[:, 0].min()), float(pts[:, 1].min()), float(pts[:, 0].max()), float(pts[:, 1].max())],
            }
    return found


def detect(img):
    """The official colour program on one frame. Returns a JSON-ready dict."""
    t0 = time.perf_counter()
    h, w = img.shape[:2]
    markers = _markers(img)
    calib = None
    roi = (0, 0, w - 1, h - 1)
    if 1 in markers and 2 in markers:
        a, b = markers[1], markers[2]
        span = abs(a["u"] - b["u"]) + abs(a["v"] - b["v"])
        if span > 1:
            calib = {"cu": (a["u"] + b["u"]) / 2, "cv": (a["v"] + b["v"]) / 2, "ratio": MARKER_SPAN_MM / span}
            # crop to the board: the square the markers span, grown by one marker size
            pad = max(a["box"][2] - a["box"][0], b["box"][2] - b["box"][0])
            roi = (
                max(0, round(min(a["box"][0], b["box"][0]) - pad)),
                max(0, round(min(a["box"][1], b["box"][1]) - pad)),
                min(w - 1, round(max(a["box"][2], b["box"][2]) + pad)),
                min(h - 1, round(max(a["box"][3], b["box"][3]) + pad)),
            )
    x0, y0, x1, y1 = roi
    roi_min = min(x1 - x0 + 1, y1 - y0 + 1)
    crop = img[y0:y1 + 1, x0:x1 + 1]
    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    best = {}
    for color, lo, hi in OFFICIAL_HSV:
        mask = cv2.inRange(hsv, np.array(lo), np.array(hi))
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for c in contours:
            x, y, bw, bh = cv2.boundingRect(c)
            x, y = x + x0, y + y0
            # official size filter: the shorter side between 1/10 of the crop and the whole crop
            if not (roi_min / 10 < min(bw, bh) < roi_min):
                continue
            area = bw * bh
            if color not in best or area > best[color]["area"]:
                best[color] = {"color": color, "u": x + bw / 2, "v": y + bh / 2, "box": [x, y, x + bw, y + bh], "area": area}
    detections = []
    for d in best.values():
        if calib:
            d["x"] = round((d["v"] - calib["cv"]) * calib["ratio"] + CAL_BOARD[0], 1)
            d["y"] = round((d["u"] - calib["cu"]) * calib["ratio"] + CAL_BOARD[1], 1)
        detections.append(d)
    return {
        "ok": True,
        "width": w,
        "height": h,
        "markers": sorted(markers),
        "roi": list(roi),
        "calibration": calib,
        "detections": detections,
        "ms": round((time.perf_counter() - t0) * 1000, 1),
        "engine": f"OpenCV {cv2.__version__} (로봇 안에서 실행)",
    }


# --- Hand camera (camera flange): Elephant Robotics' RDK X5 vision kit, color_demo.py --------------
# Camera intrinsics and distortion of the flange camera, and its pose in the tool frame
# (EyesInHand_matrix, measured with the tool reference 100 mm out along the flange axis).
HAND_K = [[639.50350871, 0.0, 311.3847461], [0.0, 638.50603424, 219.9975647], [0.0, 0.0, 1.0]]
HAND_DIST = [[1.47614748e-01, -1.20671013e+00, 3.51376303e-03, -1.35507970e-03, 2.57014341e+00]]
EYES_IN_HAND = [
    [-0.6939603779673582, -0.7171871341589221, -0.06373074931549055, -7.2912624200794731],
    [0.7196847052210569, -0.6935946078435518, -0.031312059038481804, 43.800953790167206],
    [-0.021746698192629678, -0.06759537385991699, 0.9974757874507313, -88.38631938563842],
    [0.0, 0.0, 0.0, 1.0],
]
HAND_TOOL_MM = 100.0       # set_tool_reference([0, 0, 100, 0, 0, 0])
# The firmware's tool frame turned about the flange axis relative to the URDF flange frame, as the
# camera flange mesh shows it (the calibrated lens offset lies on the mesh's camera side): the
# console's 3D hand camera assumes this, and /api/selfcheck measures it on the robot.
FIRMWARE_TO_FLANGE_DEG = -math.degrees(math.atan2(43.800953790167206, -7.2912624200794731))
# The kit program puts every block at one fixed distance in front of the lens (cam_X = x_norm * 230,
# target z 209.79): right only at its own photo height. Here the pixel's ray is followed down to the
# height of the block tops instead (given by the console: block size, and a base under the robot),
# which is the same point at that height and stays right when the arm looks from higher or lower.
BLOCK_TOP_MM = 25.0
# The kit's colour ranges for the hand camera (red wraps round H = 180), OpenCV units.
HAND_HSV = [
    ("빨강", [((0, 100, 100), (10, 255, 255)), ((160, 100, 100), (180, 255, 255))]),
    ("초록", [((35, 50, 50), (85, 255, 255))]),
    ("파랑", [((90, 50, 50), (130, 255, 255))]),
    ("노랑", [((20, 50, 50), (35, 255, 255))]),
]
HAND_MIN_AREA = 500


def euler_sxyz(rx, ry, rz):
    """Rotation matrix of roll, pitch, yaw in degrees, static axes x-y-z (transforms3d 'sxyz')."""
    a, b, c = (math.radians(v) for v in (rx, ry, rz))
    ca, sa, cb, sb, cc, sc = math.cos(a), math.sin(a), math.cos(b), math.sin(b), math.cos(c), math.sin(c)
    return [
        [cc * cb, cc * sb * sa - sc * ca, cc * sb * ca + sc * sa],
        [sc * cb, sc * sb * sa + cc * ca, sc * sb * ca - cc * sa],
        [-sb, cb * sa, cb * ca],
    ]


def tool_matrix(coords, tool_offset_mm):
    """4 x 4 pose of the tool point from get_coords (x, y, z mm, rx, ry, rz °), moved out along the
    flange axis by tool_offset_mm (what set_tool_reference would add)."""
    x, y, z, rx, ry, rz = coords
    r = euler_sxyz(rx, ry, rz)
    p = [x + r[0][2] * tool_offset_mm, y + r[1][2] * tool_offset_mm, z + r[2][2] * tool_offset_mm]
    return [r[0] + [p[0]], r[1] + [p[1]], r[2] + [p[2]], [0.0, 0.0, 0.0, 1.0]]


def hand_camera_pose(coords, tool_offset_mm=HAND_TOOL_MM):
    """4 x 4 pose of the hand camera (OpenCV axes: x right, y down, z forward) in the robot's base frame."""
    tool = tool_matrix(coords, tool_offset_mm)
    return [[sum(tool[i][k] * EYES_IN_HAND[k][j] for k in range(4)) for j in range(4)] for i in range(4)]


def pixel_to_plane(cam_pose, xn, yn, plane_z):
    """Where the ray through an undistorted pixel (normalised xn, yn) meets the plane z = plane_z (mm)."""
    d = [cam_pose[i][0] * xn + cam_pose[i][1] * yn + cam_pose[i][2] for i in range(3)]
    o = [cam_pose[i][3] for i in range(3)]
    if d[2] > -1e-6:          # the ray does not go down
        return None
    s = (plane_z - o[2]) / d[2]
    if s <= 0:
        return None
    return [o[0] + d[0] * s, o[1] + d[1] * s, plane_z]


def detect_hand(img, coords, tool_offset_mm=HAND_TOOL_MM, plane_z=BLOCK_TOP_MM):
    """The official hand-camera colour program on one frame, with each block's position in the robot's
    base frame (mm): the largest patch of each colour → its centre, undistorted with the kit's camera
    calibration → the ray from the camera (EyesInHand on the arm's pose from get_coords) → where it meets
    the block tops (z = plane_z in the robot's frame)."""
    t0 = time.perf_counter()
    h, w = img.shape[:2]
    # The kit's numbers are for 640 x 480; frames here are 640 wide, so pixels match.
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    kernel = np.ones((5, 5), np.uint8)
    k = np.array(HAND_K)
    dist = np.array(HAND_DIST)
    cam_pose = hand_camera_pose(coords, tool_offset_mm) if coords else None
    detections = []
    for color, ranges in HAND_HSV:
        mask = np.zeros(hsv.shape[:2], np.uint8)
        for lo, hi in ranges:
            mask = cv2.bitwise_or(mask, cv2.inRange(hsv, np.array(lo), np.array(hi)))
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            continue
        cnt = max(contours, key=cv2.contourArea)
        area = cv2.contourArea(cnt)
        if area <= HAND_MIN_AREA:
            continue
        (cx, cy), _, yaw = cv2.minAreaRect(cnt)
        x0, y0, bw, bh = cv2.boundingRect(cnt)
        und = cv2.undistortPoints(np.array([[[cx, cy]]], dtype=np.float32), k, dist)
        xn, yn = float(und[0, 0, 0]), float(und[0, 0, 1])
        d = {"color": color, "u": float(cx), "v": float(cy), "box": [x0, y0, x0 + bw, y0 + bh], "area": float(area),
             "yaw": float(yaw)}
        hit = pixel_to_plane(cam_pose, xn, yn, plane_z) if cam_pose else None
        if hit:
            d["x"], d["y"], d["z"] = round(hit[0], 1), round(hit[1], 1), round(hit[2], 1)
        detections.append(d)
    detections.sort(key=lambda d: -d["area"])
    return {
        "ok": True,
        "width": w,
        "height": h,
        "detections": detections,
        "coords": coords,
        "toolOffset": tool_offset_mm,
        "planeZ": plane_z,
        "ms": round((time.perf_counter() - t0) * 1000, 1),
        "engine": f"OpenCV {cv2.__version__} · 공식 RDK X5 손 카메라 보정 (로봇 안에서 실행)",
    }


# --- AI sample: YOLOv5s object detection, as Elephant Robotics' RDK X5 vision kit runs it -----------
# (mycobot280RDKX5_vision_kit yolo_demo.py: OpenCV DNN on the robot's CPU, the 640 x 640 ONNX model,
# confidence 0.4, class score 0.5, NMS 0.45). The model file comes with the USB kit: models/yolov5s.onnx.
MODEL_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models")
YOLO_MODEL = os.path.join(MODEL_DIR, "yolov5s.onnx")
COCO = (
    "person bicycle car motorcycle airplane bus train truck boat traffic_light fire_hydrant stop_sign parking_meter "
    "bench bird cat dog horse sheep cow elephant bear zebra giraffe backpack umbrella handbag tie suitcase frisbee "
    "skis snowboard sports_ball kite baseball_bat baseball_glove skateboard surfboard tennis_racket bottle wine_glass "
    "cup fork knife spoon bowl banana apple sandwich orange broccoli carrot hot_dog pizza donut cake chair couch "
    "potted_plant bed dining_table toilet tv laptop mouse remote keyboard cell_phone microwave oven toaster sink "
    "refrigerator book clock vase scissors teddy_bear hair_drier toothbrush"
).split()
COCO_KO = {
    "person": "사람", "bicycle": "자전거", "car": "자동차", "motorcycle": "오토바이", "airplane": "비행기", "bus": "버스",
    "train": "기차", "truck": "트럭", "boat": "배", "traffic_light": "신호등", "fire_hydrant": "소화전", "stop_sign": "정지 표지",
    "parking_meter": "주차 요금기", "bench": "벤치", "bird": "새", "cat": "고양이", "dog": "개", "horse": "말", "sheep": "양",
    "cow": "소", "elephant": "코끼리", "bear": "곰", "zebra": "얼룩말", "giraffe": "기린", "backpack": "가방", "umbrella": "우산",
    "handbag": "핸드백", "tie": "넥타이", "suitcase": "여행 가방", "frisbee": "원반", "skis": "스키", "snowboard": "스노보드",
    "sports_ball": "공", "kite": "연", "baseball_bat": "야구 방망이", "baseball_glove": "야구 글러브", "skateboard": "스케이트보드",
    "surfboard": "서핑보드", "tennis_racket": "테니스 라켓", "bottle": "병", "wine_glass": "와인잔", "cup": "컵", "fork": "포크",
    "knife": "칼", "spoon": "숟가락", "bowl": "그릇", "banana": "바나나", "apple": "사과", "sandwich": "샌드위치",
    "orange": "오렌지", "broccoli": "브로콜리", "carrot": "당근", "hot_dog": "핫도그", "pizza": "피자", "donut": "도넛",
    "cake": "케이크", "chair": "의자", "couch": "소파", "potted_plant": "화분", "bed": "침대", "dining_table": "식탁",
    "toilet": "변기", "tv": "모니터", "laptop": "노트북", "mouse": "마우스", "remote": "리모컨", "keyboard": "키보드",
    "cell_phone": "휴대폰", "microwave": "전자레인지", "oven": "오븐", "toaster": "토스터", "sink": "싱크대",
    "refrigerator": "냉장고", "book": "책", "clock": "시계", "vase": "꽃병", "scissors": "가위", "teddy_bear": "곰 인형",
    "hair_drier": "헤어드라이어", "toothbrush": "칫솔",
}


class Yolo:
    CONF = 0.4
    SCORE = 0.5
    NMS = 0.45
    SIZE = 640

    def __init__(self):
        self.net = None
        self.lock = threading.Lock()

    @staticmethod
    def available():
        if cv2 is None:
            return False, "이 로봇에 OpenCV(cv2)가 없어요."
        if not os.path.exists(YOLO_MODEL):
            return False, f"AI 모델 파일이 없어요 ({YOLO_MODEL}). 새 USB 키트로 다시 설치해 주세요."
        return True, ""

    def detect(self, img):
        ok, why = self.available()
        if not ok:
            raise RuntimeError(why)
        with self.lock:
            t0 = time.perf_counter()
            if self.net is None:
                self.net = cv2.dnn.readNet(YOLO_MODEL)
            load_ms = (time.perf_counter() - t0) * 1000
            t1 = time.perf_counter()
            blob = cv2.dnn.blobFromImage(img, 1 / 255, (self.SIZE, self.SIZE), [0, 0, 0], 1, crop=False)
            self.net.setInput(blob)
            out = self.net.forward(self.net.getUnconnectedOutLayersNames())[0][0]
            ms = (time.perf_counter() - t1) * 1000
        h, w = img.shape[:2]
        fx, fy = w / self.SIZE, h / self.SIZE
        boxes, scores, ids = [], [], []
        for row in out[out[:, 4] > self.CONF]:
            cls = int(np.argmax(row[5:]))
            if row[5 + cls] <= self.SCORE:
                continue
            cx, cy, bw, bh = row[:4]
            boxes.append([int((cx - bw / 2) * fx), int((cy - bh / 2) * fy), int(bw * fx), int(bh * fy)])
            scores.append(float(row[4]))
            ids.append(cls)
        keep = cv2.dnn.NMSBoxes(boxes, scores, self.CONF, self.NMS) if boxes else []
        found = []
        shown = img.copy()
        for i in np.array(keep).flatten():
            x, y, bw, bh = boxes[i]
            name = COCO[ids[i]] if ids[i] < len(COCO) else str(ids[i])
            found.append({"name": name, "label": COCO_KO.get(name, name.replace("_", " ")), "score": round(scores[i], 2),
                          "box": [x, y, x + bw, y + bh]})
            cv2.rectangle(shown, (x, y), (x + bw, y + bh), (50, 178, 255), 2)
            text = f"{name}:{scores[i]:.2f}"
            (tw, th), base = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 1)
            cv2.rectangle(shown, (x, max(0, y - th - base - 4)), (x + tw + 4, y), (0, 0, 0), cv2.FILLED)
            cv2.putText(shown, text, (x + 2, y - base - 2), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 1)
        found.sort(key=lambda d: -d["score"])
        ok, jpg = cv2.imencode(".jpg", shown, [cv2.IMWRITE_JPEG_QUALITY, 80])
        return {
            "ok": True,
            "width": w,
            "height": h,
            "detections": found,
            "ms": round(ms, 1),
            "loadMs": round(load_ms, 1) if load_ms > 1 else 0,
            "engine": f"YOLOv5s · OpenCV {cv2.__version__} DNN (로봇 CPU 에서 실행, 공식 RDK X5 비전 키트 방식)",
            "image": jpg.tobytes() if ok else None,
        }
