import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Svg({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function IconPaperclip(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M8.5 12.5 15 6a3.2 3.2 0 1 1 4.5 4.5l-8.8 8.8a4.4 4.4 0 0 1-6.2-6.2l8.2-8.2" />
    </Svg>
  );
}

export function IconSend(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M21 3 10.5 13.5" />
      <path d="M21 3 14.2 21l-3.7-7.5L3 9.8 21 3Z" />
    </Svg>
  );
}

export function IconFolder(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2.2h7.5A2.5 2.5 0 0 1 21 9.7v7.8A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5v-10Z" />
    </Svg>
  );
}

export function IconGear(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="3.1" />
      <path d="M12 3.5v2.2M12 18.3v2.2M4.8 6.8l1.6 1.6M17.6 15.6l1.6 1.6M3.5 12h2.2M18.3 12h2.2M4.8 17.2l1.6-1.6M17.6 8.4l1.6-1.6" />
    </Svg>
  );
}

export function IconPlus(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

export function IconSun(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="3.4" />
      <path d="M12 3.4v1.8M12 18.8v1.8M4.8 4.8l1.3 1.3M17.9 17.9l1.3 1.3M3.4 12h1.8M18.8 12h1.8M4.8 19.2l1.3-1.3M17.9 6.1l1.3-1.3" />
    </Svg>
  );
}

export function IconMoon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M16.4 14.6A6.2 6.2 0 0 1 9.2 7.2 6.4 6.4 0 1 0 16.4 14.6Z" />
    </Svg>
  );
}

export function IconDesktop(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3.5" y="5" width="17" height="11.5" rx="1.8" />
      <path d="M8 20h8M12 16.5V20" />
    </Svg>
  );
}

export function IconClose(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 6 18 18M18 6 6 18" />
    </Svg>
  );
}

export function IconImage(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3.5" y="5" width="17" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.4" />
      <path d="m3.8 16 5.2-4.4 3.3 2.8 2.6-2.2 5.3 4.2" />
    </Svg>
  );
}

export function IconMark({ className }: { className?: string }) {
  return (
    <svg className={className} width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <rect x="1.2" y="1.2" width="45.6" height="45.6" rx="12" stroke="currentColor" strokeOpacity="0.55" />
      <path
        d="M10 29c3.2-4.4 6.4-6.6 9.6-6.6 3.6 0 4.8 4.4 8.2 4.4 3.1 0 6-2.6 10.2-7.8"
        stroke="#C9A84C"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M10 33.5c3.4-4 6.8-6 10.2-6 3.8 0 5 4 8.6 4 3.2 0 6.2-2.4 10.2-7.2"
        stroke="#5EE0C8"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeOpacity="0.9"
      />
      <circle cx="24" cy="16.5" r="2.2" fill="#C9A84C" />
    </svg>
  );
}
