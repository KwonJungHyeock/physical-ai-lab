/**
 * A sentence that names ▶ (입문 과정, 수정 지시서 v2 파트 D-1): the triangle is drawn as on the 시뮬레이션
 * button — one shape everywhere, never the letter ▶ beside the drawn one.
 */

import { Fragment } from 'react';

import Icon from './Icon';

export default function PlayText({ text, size = 18 }: { text: string; size?: number }) {
  const parts = text.split('▶');
  if (parts.length === 1) return <>{text}</>;
  return (
    <>
      {parts.map((p, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <span role="img" aria-label="시뮬레이션 세모" style={{ display: 'inline-block', verticalAlign: '-0.12em', lineHeight: 0 }}>
              <Icon name="play" size={size} />
            </span>
          )}
          {p}
        </Fragment>
      ))}
    </>
  );
}
