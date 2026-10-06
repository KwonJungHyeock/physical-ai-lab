/**
 * The developer pages under /spike were designed on a dark surface. The site
 * is white now, so this layout keeps them dark instead of restyling each one.
 */
export default function SpikeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-1 flex-col bg-[#0a0a0a] text-[#ededed] [color-scheme:dark]">
      {children}
    </div>
  );
}
