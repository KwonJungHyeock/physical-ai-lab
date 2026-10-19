/**
 * A touch screen as the main pointer (a Galaxy Tab or an iPad held as a teaching pendant): no
 * hover, fingers instead of a mouse, a mobile GPU. Read once per call; false on the server.
 */
export function isTouch(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;
}
