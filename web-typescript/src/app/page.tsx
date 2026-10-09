/**
 * The address without a page opens the simulator (the robot's server and the PC program open
 * /console directly; this is for a typed or bookmarked bare address).
 */
export default function Home() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <meta httpEquiv="refresh" content="0; url=/console" />
      <a className="text-base font-semibold underline" href="/console">
        로봇 학습 시뮬레이터 열기
      </a>
    </main>
  );
}
