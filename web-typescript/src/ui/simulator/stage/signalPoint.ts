/**
 * Where on the screen the signal said now is (로봇 카페 · 주문 한 잔 따라가기): written each frame by
 * the 3D scene (CellScene Narrate: the bubble's foot over the machine, in page pixels), read by the
 * 지금 신호 card (CellHud) to draw its tracking line there. Not React state: it moves every frame.
 */
export const signalPoint = { on: false, x: 0, y: 0, out: false };
