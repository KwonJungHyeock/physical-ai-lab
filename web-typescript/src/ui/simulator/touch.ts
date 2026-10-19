import { useEffect, useState } from 'react';

/**
 * A touch screen as the main pointer (a Galaxy Tab or an iPad held as a teaching pendant): no
 * hover, fingers instead of a mouse, a mobile GPU. Read once per call; false on the server.
 */
export function isTouch(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;
}

/** isTouch for rendering: false on the server and the first paint, then the device's answer (no hydration mismatch). */
export function useTouch(): boolean {
  const [touch, setTouch] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read once after hydration
    setTouch(isTouch());
  }, []);
  return touch;
}
