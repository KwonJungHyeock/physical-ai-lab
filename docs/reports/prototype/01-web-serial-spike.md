[보고 #1] 리포 초기화 + Web Serial 스파이크

■ push 완료
- repo: https://github.com/KwonJungHyeock/physical-ai-lab
- main = 33d78de  (첫 커밋)
- Vercel import 준비 완료. 프레임워크 자동 감지만으로 import 됨.
  환경변수 없음 / 서버 런타임 의존성 없음 / 세 페이지 모두 정적 프리렌더.

■ 스택
- Next.js 16.3.2 (App Router) + TypeScript + Tailwind v4. 단일 앱, 모노레포 아님.
- .gitignore, README 포함.

■ 페이지
- /              스파이크 목록
- /spike/serial  Web Serial 브리지 (연결 / 전원 ON·OFF / 6축 읽기·쓰기 / 그리퍼 / hex 로그)
- /spike/diag    환경 진단 (Web Serial 지원·브라우저·OS·secure context 판정 + 대응 안내)

■ 프로토콜 출처 — 추정 없음
pymycobot 4.0.6 공식 소스(PyPI wheel)에서 추출. opcode/프레임/인코딩마다 SDK 파일·심볼명을
코드 주석에 남김.
- common.py      : ProtocolCode(opcode, HEADER/FOOTER), DataProcessor._mesg(프레임 구성),
                   _process_received(응답 파싱), _encode_int16/_angle2int, read()(타임아웃)
- generate.py    : CommandGenerator — 인자 순서, has_reply 여부
- mycobot280.py  : MyCobot280 — 시리얼 파라미터, _res 재시도, 응답 후처리, 그리퍼
- robot_info.py  : robot_limit["MyCobot280"] — 관절 가동 범위

프레임 구조
  FE FE LEN OPCODE [payload] FA
  LEN = payload 길이 + 2  (opcode·footer 포함, header 2바이트와 자기 자신 제외)
  전체 프레임 길이 = LEN + 3
  근거: _mesg 의 LEN = len(command_data) + 2
        _process_received 의 data_len = data[i+2] - 2, data_pos = i+4
  ※ CRC-16 트레일러 변형은 crc_robot_class(Mercury/Pro) 전용. MyCobot280 은 해당 없음 → 0xFA.

■ 판단 필요하다고 하신 항목 — 전부 소스에서 확정, 질문 없이 진행
- baudrate      115200 8N1   : MyCobot280.__init__(baudrate="115200")
- 프레임 종료   0xFA         : ProtocolCode.FOOTER
- 응답 타임아웃 500ms        : read() 의 Windows 0.15 / 그 외 0.5 중 큰 값
                               (브라우저는 호스트 OS 를 신뢰할 수 없어 큰 쪽 채택)
- 재시도        3회          : MyCobot280._res 의 while try_count < 3
- 오픈 후 대기  1500ms       : time.sleep(1.5)  # use to 280 AR (ATOM 리셋 후 부팅 대기)
- RTS/DTR       de-assert    : self._serial_port.rts = False

■ 구현한 명령
  기능                    opcode  프레임
  컨트롤러 연결 확인      0x14    FE FE 02 14 FA
  전원 ON                 0x10    FE FE 02 10 FA
  전원 OFF                0x11    FE FE 02 11 FA
  전원 상태               0x12    FE FE 02 12 FA
  서보 해제               0x13    FE FE 02 13 FA
  관절각 읽기(6축)        0x20    FE FE 02 20 FA
  관절각 쓰기(6축+속도)   0x22    FE FE 0F 22 <6xint16BE> <speed> FA
  관절각 쓰기(단일축)     0x21    FE FE 06 21 <id> <int16BE> <speed> FA
  그리퍼 개폐             0x66    FE FE 04 66 <flag> <speed> FA
  그리퍼 값 읽기          0x65    FE FE 02 65 FA
- 각도: 부호 있는 big-endian int16, 1/100도 단위 (_angle2int = int(angle*100))
- 그리퍼 flag: 0 열기 / 1 닫기 / 254 해제
- 속도 1~100, 그리퍼 속도 0~100
- 관절 범위(당시): min [-168,-140,-150,-150,-155,-180] / max [168,140,150,150,160,180]
  → 보고 #2 에서 재확정됨

■ 주의점 (설계에 반영함)
0xFA 는 이스케이프되지 않음. 그리퍼 release 프레임이 FE FE 04 66 FE 32 FA 라서
footer 스캔 방식 파서는 깨짐 → LEN 기반으로 자르도록 구현하고 회귀 테스트로 고정.

■ 검증 결과
- npm run check:protocol
  13종 프레임을 pymycobot DataProcessor._mesg 실제 출력과 바이트 단위 대조 → 전부 일치
- npm run check:transport
  ATOM 에뮬레이터 상대 통합 검증 6종 통과
  (왕복 통신 / 1바이트 단위 분할 수신 / 에코 프레임 무시 /
   타임아웃→재시도→실패 / 동시 호출 직렬화 / hex 로그)
- npm run lint, npm run build 통과
- Chromium 실브라우저로 세 페이지 렌더 확인, 콘솔 에러 0
- navigator.serial 제거한 컨텍스트로 차단 PC 시뮬레이션 → "불가" 판정·안내 문구 확인

검증 중 실제 버그 1건 발견·수정:
  'serial' in navigator 는 정책 차단 Chromium 에서 값이 undefined 여도 true 를 반환.
  → !!navigator.serial 로 변경.

■ 실기기 연결 — 미검증
이 환경에 하드웨어가 없어 실기기 연결은 검증하지 못했습니다.
/spike/serial 에서 [연결] 후 hex 로그 [복사] 버튼으로 전체를 복사해 주시면 대조하겠습니다.

■ 드라이버
M5Stack ATOM 은 생산 시기에 따라 CP210x 또는 CH9102 를 사용합니다. 실기기 VID:PID 가
확인되면 확정 가능합니다. /spike/diag 에서 장치관리자 확인 후 설치로 안내.

■ 이번 범위 제외 — 손대지 않음
3D 뷰어 / URDF / IK / 디지털 트윈, Blockly / 코드 에디터, 차시 콘텐츠·학습 UI·진도·제출,
DB / 인증 / 교사 대시보드, Vercel 프로젝트 생성·연결, 디자인 완성도.
