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
    task: '컨베이어 끝에 멈춘 상자를 흡착 손으로 집어, 정해진 쌓기 패턴대로 팔레트에 층층이 쌓아요.',
    scale: '실제 팔레타이징 로봇은 사람 키보다 크고 수십 kg 상자를 들어요. 사람이 못 들어가게 안전 펜스와 광 커튼 안에서 일해요.',
    same: '상자 크기가 바뀌면 층 높이를, 무거우면 가속도를, 팔레트가 옮겨지면 기준점을 다시 잡는 일은 실제 현장 엔지니어도 똑같이 해요.',
  },
  factory: {
    where: '전자 · 자동차 부품 공장의 조립 · 검사 라인',
    task: '컨베이어로 오는 부품을 센서와 카메라로 확인하고, 집어서 다음 공정이나 불량함으로 옮겨요 (픽 앤 플레이스).',
    scale: '실제 라인은 부품 하나를 1~2초 안에 옮기고, 컨베이어 속도를 읽어 움직이는 부품을 따라가며 집어요.',
    same: '센서 위치, 집는 자리의 좌표, 움직이는 물체를 집는 타이밍은 이 셀에서 고치는 값과 같아요.',
  },
  bio: {
    where: '병원 진단검사실 · 제약 연구소의 검체 자동화 장비',
    task: '시험관을 랙에서 꺼내 원심분리기와 분석기로 옮겨요. 하루 수천 개 검체를 사람 손 없이 처리해요.',
    scale: '실제 장비는 바코드로 시료를 하나하나 추적하고, 감염을 막는 안전 캐비닛 안에서 움직여요.',
    same: '시료를 쏟지 않는 손목 자세, 먼 칸까지 정확히 맞추는 좌표, 부딪히지 않는 돌아가는 길은 이 실습과 같아요.',
  },
  farm: {
    where: '농산물 선별장 · 스마트팜 수확 라인',
    task: '카메라로 과일의 색과 크기를 보고 등급을 나눈 뒤, 로봇이 등급별 상자에 담아요.',
    scale: '실제 선별 라인은 한 시간에 수천 개를 처리하고, 과일이 상하지 않게 말랑한 소프트 그리퍼를 써요.',
    same: '익은 색을 가르는 문턱값, 카메라를 옮긴 뒤 다시 재는 픽셀과 mm의 비율, 터지지 않게 잡는 힘은 이 셀과 같아요.',
  },
  cafe: {
    where: '로봇 카페 · 무인 음료 매장',
    task: '협동로봇이 컵을 옮기고 음료를 따른 뒤 픽업대에 내려놓아요.',
    scale: '손님 가까이에서 일하는 협동로봇이라 속도와 힘이 제한되고, 무언가에 닿으면 바로 멈춰요.',
    same: '흘리지 않게 가속도를 묶는 것, 사람 손이 가까워지면 미리 느려지고 멈추는 거리는 이 실습에서 고치는 값 그대로예요.',
  },
  care: {
    where: '요양 시설 · 병원의 돌봄 로봇 (연구 · 시범 단계)',
    task: '이동 로봇 위에 올린 로봇팔이 침대 곁으로 가서 물병 같은 물건을 사람에게 건네요.',
    scale: '아직 시범 서비스가 많아요. 사람 손에 건네는 순간에는 속도와 힘을 아주 낮추고 사람 손 위치를 카메라로 확인해요.',
    same: '무거운 물병은 몸 가까이 당겨 천천히 돌리고, 건네는 높이와 거리를 맞추는 것은 이 셀과 같아요.',
  },
  ai: {
    where: '온라인 쇼핑 물류센터의 피킹 스테이션',
    task: '상자 안에 섞인 처음 보는 물건을 카메라와 인공지능으로 알아보고, 집을 자리를 골라 꺼내요 (빈 피킹).',
    scale: '실제로는 3D 카메라와 수많은 사진으로 학습한 모델을 쓰고, 집기에 실패하면 자세를 바꿔 다시 시도해요.',
    same: '카메라 좌표를 로봇 좌표로 바꾸고, 판단 기준을 정하고, 시연으로 동작을 가르치는 흐름은 이 실습과 같아요.',
  },
  energy: {
    where: '재활용 선별장 · 자원순환 센터',
    task: '컨베이어로 쏟아지는 페트병 · 캔 · 종이를 인공지능 카메라로 구분하고, 로봇이 재질별로 빠르게 집어 나눠요.',
    scale: '실제 선별 로봇은 1분에 수십 번 집어요. 더럽고 찌그러진 물건이 많아 흡착 손을 주로 써요.',
    same: '투명 PET를 알아보는 판별 기준, 빨리 옮겨도 떨어뜨리지 않는 가속도, 겹친 물건을 집는 순서는 이 셀에서 정하는 값과 같아요.',
  },
};
