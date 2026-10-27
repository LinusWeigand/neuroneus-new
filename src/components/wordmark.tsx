import Link from "next/link";

export function Wordmark({ href = "/", className = "" }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={`inline-flex items-baseline gap-0.5 text-ink ${className}`} aria-label="Neuroneus home">
      <span className="text-display-sm tracking-[-0.4px]">neuroneus</span>
    </Link>
  );
}
