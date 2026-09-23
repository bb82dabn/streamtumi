import Image from "next/image";
import Link from "next/link";
import logo from "@/assets/branding/streamtumi-logo.png";

export function Brand({ href = "/" }: { href?: string }) {
  return (
    <Link className="brand" href={href} aria-label="StreamTumi home">
      <Image className="brand-logo" src={logo} alt="" preload />
    </Link>
  );
}

export function RadioBrand({ href = "/guide?type=radio" }: { href?: string }) {
  return (
    <Link className="brand radio-product-brand" href={href} aria-label="StreamTumi Radio home">
      <Image className="brand-logo" src={logo} alt="" preload />
      <strong>Radio</strong>
    </Link>
  );
}
