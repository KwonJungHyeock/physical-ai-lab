import Link from 'next/link';

const PAGES = [
  {
    href: '/console',
    title: '로봇팔 실습',
    description:
      '블록과 파이썬으로 로봇팔을 프로그래밍합니다. 엔드이펙터를 바꿔 끼우고, 카메라로 블록을 찾아 옮겨 봅니다. 시뮬레이션에서 확인한 뒤 실제 로봇에서 실행합니다.',
  },
  {
    href: '/spike/twin',
    title: '관절과 좌표',
    description: '관절 좌표축과 순기구학·역기구학을 3D 로 살펴봅니다.',
  },
];

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight">피지컬 AI 로봇팔 실습</h1>
      <p className="mt-3 text-[15px] text-[#6b7682]">myCobot 280 RDK X5</p>

      <ul className="mt-10 grid gap-3">
        {PAGES.map((page) => (
          <li key={page.href}>
            <Link
              href={page.href}
              className="block rounded-xl border border-[#e4e8ed] bg-white px-5 py-4 transition hover:border-[#b9c2cc] hover:shadow-sm"
            >
              <span className="text-base font-semibold">{page.title}</span>
              <p className="mt-1 text-sm leading-relaxed text-[#6b7682]">{page.description}</p>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
