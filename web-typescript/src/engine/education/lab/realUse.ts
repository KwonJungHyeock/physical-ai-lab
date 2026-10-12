/**
 * 실제 현장 적용: for each site lab, how robot arms do the same job in real workplaces, shown over the
 * lab's 3D cell. The cell is a desk-sized copy of that application; these lines say what the full-size
 * one is, what the arm does there, and what is different at real scale (and what stays the same, so
 * the values the student fixes are the ones a real engineer fixes).
 */

export type RealUseSite = 'factory' | 'logistics' | 'bio' | 'farm' | 'cafe' | 'care' | 'ai' | 'energy';

export interface RealUse {
  /** Where this application runs, in a few words. */
  where: string;
  /** What the arm does there, one sentence. */
  task: string;
  /** What the real cell has that this desk cell leaves out. */
  scale: string;
  /** What carries over unchanged: the very values this lab works on. */
  same: string;
}

export const REAL_USE: Record<RealUseSite, RealUse> = {
  logistics: {
    where: '물류센터 · 식품 · 음료 공장의 출고 라인 끝',
    task: '멈춘 상자를 흡착 손으로 집어요. 정해진 패턴대로 층층이 쌓아요.',
    scale: '실제 로봇은 사람 키보다 커요. 수십 kg 상자를 들어요. 안전 펜스와 광 커튼 안에서 일해요.',
    same: '상자가 바뀌면 층 높이를 다시 정해요. 무거우면 가속도를 줄여요. 팔레트가 옮겨지면 기준점을 다시 잡아요. 현장 엔지니어도 똑같이 해요.',
  },
  factory: {
    where: '전자 · 자동차 부품 공장의 조립 · 검사 라인',
    task: '오는 부품을 센서와 카메라로 확인해요. 집어서 다음 공정이나 불량함으로 옮겨요.',
    scale: '실제 라인은 부품 하나를 1~2초에 옮겨요. 움직이는 부품을 따라가며 집어요.',
    same: '센서 위치, 집는 좌표, 집는 타이밍. 이 셀에서 고치는 값과 같아요.',
  },
  bio: {
    where: '병원 진단검사실 · 제약 연구소의 검체 자동화 장비',
    task: '시험관을 꺼내 원심분리기와 분석기로 옮겨요. 하루 수천 개를 사람 손 없이 처리해요.',
    scale: '바코드로 시료를 하나하나 추적해요. 감염을 막는 캐비닛 안에서 움직여요.',
    same: '쏟지 않는 손목 자세와 먼 칸의 좌표. 부딪히지 않는 길도 이 실습과 같아요.',
  },
  farm: {
    where: '농산물 선별장 · 스마트팜 수확 라인',
    task: '카메라로 색과 크기를 보고 등급을 나눠요. 로봇이 등급별 상자에 담아요.',
    scale: '실제 라인은 한 시간에 수천 개를 처리해요. 말랑한 소프트 그리퍼로 잡아요.',
    same: '익은 색의 문턱값, 픽셀과 mm의 비율, 잡는 힘. 이 셀과 같아요.',
  },
  cafe: {
    where: '로봇 카페 · 무인 음료 매장',
    task: '협동로봇이 컵을 옮겨 음료를 따라요. 그리고 픽업대에 내려놓아요.',
    scale: '손님 곁에서 일해서 속도와 힘이 낮아요. 무언가에 닿으면 바로 멈춰요.',
    same: '흘리지 않게 가속도를 줄여요. 손이 가까우면 느려지고 멈춰요. 이 실습에서 고치는 값 그대로예요.',
  },
  care: {
    where: '요양 시설 · 병원의 돌봄 로봇 (연구 · 시범 단계)',
    task: '이동 로봇 위의 로봇팔이 침대 곁으로 가요. 물병 같은 물건을 건네요.',
    scale: '아직 시범 서비스가 많아요. 건넬 때는 속도와 힘을 아주 낮춰요. 손 위치는 카메라로 확인해요.',
    same: '무거운 물병은 몸 가까이 당겨 천천히 돌려요. 건네는 높이와 거리도 이 셀과 같아요.',
  },
  ai: {
    where: '온라인 쇼핑 물류센터의 피킹 스테이션',
    task: '섞인 물건을 카메라와 인공지능으로 알아봐요. 집을 자리를 골라 꺼내요.',
    scale: '3D 카메라와 사진으로 학습한 모델을 써요. 실패하면 자세를 바꿔 다시 해요.',
    same: '카메라 좌표를 로봇 좌표로 바꿔요. 기준을 정하고 시연으로 가르쳐요. 이 실습과 같은 흐름이에요.',
  },
  energy: {
    where: '재활용 선별장 · 자원순환 센터',
    task: '페트병 · 캔 · 종이를 카메라로 구분해요. 로봇이 재질별로 빠르게 나눠요.',
    scale: '실제 선별 로봇은 1분에 수십 번 집어요. 더럽고 찌그러진 물건이 많아 흡착 손을 주로 써요.',
    same: '투명 PET의 판별 기준과 가속도. 겹친 물건을 집는 순서도 이 셀과 같아요.',
  },
};
