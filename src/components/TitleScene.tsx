import { ScreenBg } from "@/components/ScreenBg";
import "./fx.css";

// Painted menu backdrop behind the title screens; `legacy` = the old SVG landscape.
export function TitleScene({ legacy = false }: { legacy?: boolean }) {
  return legacy ? <SvgTitleScene /> : <ScreenBg scene="menu" />;
}

// Decorative mountain landscape (pure SVG, no image files); kept as a fallback.
export function SvgTitleScene() {
  return (
    <svg
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 h-full w-full"
      viewBox="0 0 1600 900"
      preserveAspectRatio="xMidYMax slice"
    >
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#9fd0ee" />
          <stop offset="1" stopColor="#e4f2f8" />
        </linearGradient>
      </defs>
      <rect width="1600" height="900" fill="url(#sky)" />
      <g fill="#fff" opacity="0.6" className="b-clouds-far">
        <ellipse cx="-300" cy="70" rx="90" ry="16" />
        <ellipse cx="500" cy="60" rx="100" ry="16" />
      </g>
      <g fill="#fff" opacity="0.85" className="b-clouds-near">
        <ellipse cx="260" cy="110" rx="120" ry="22" />
        <ellipse cx="340" cy="95" rx="70" ry="18" />
        <ellipse cx="1250" cy="150" rx="140" ry="24" />
        <ellipse cx="1340" cy="132" rx="80" ry="18" />
      </g>
      <g className="b-layer-far">
        <rect x="-100" y="620" width="1800" height="280" fill="#8f8f8a" />
        <path
          d="M0 620 L180 330 L330 500 L520 250 L700 470 L880 300 L1060 480 L1260 220 L1440 420 L1600 300 V900 H0Z"
          fill="#8f8f8a"
        />
        <path
          d="M520 250 L460 340 L520 320 L560 360 L600 320 Z M1260 220 L1200 320 L1260 300 L1310 340 L1350 300 Z M180 330 L130 410 L180 395 L225 420Z"
          fill="#f4f6f7"
        />
      </g>
      <g className="b-layer-mid">
        <rect
          x="-100"
          y="700"
          width="1800"
          height="200"
          fill="#6f8a6a"
          opacity="0.8"
        />
        <path
          d="M0 700 L220 520 L420 660 L640 500 L860 680 L1100 540 L1340 690 L1600 560 V900 H0Z"
          fill="#6f8a6a"
          opacity="0.8"
        />
      </g>
      <g className="b-layer-near">
        <rect x="-100" y="830" width="1800" height="70" fill="#4f9a3c" />
        <path
          d="M0 800 C200 700 420 720 640 780 C900 850 1100 640 1350 640 C1480 640 1560 690 1600 720 V900 H0Z"
          fill="#4f9a3c"
        />
        <path
          d="M0 860 C250 800 500 840 800 870 C1100 900 1350 800 1600 830 V900 H0Z"
          fill="#3b7d2c"
        />
      </g>
      <path
        d="M120 900 C260 800 330 760 420 700 C520 640 640 640 720 600"
        stroke="#6fb8e0"
        strokeWidth="26"
        fill="none"
        opacity="0.7"
      />
      <g fill="#1f5a2a">
        {[60, 100, 140, 1450, 1500, 1545].map((x, i) => (
          <path
            key={x}
            d={`M${x} ${850 - (i % 2) * 14} l-22 50 h44 Z M${x} ${815 - (i % 2) * 14} l-18 45 h36 Z`}
          />
        ))}
      </g>
    </svg>
  );
}
