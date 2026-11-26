/**
 * Original botanical illustration for the landing hero: an arched window with a
 * rising sun, tulsi and ashwagandha sprigs, and a brass mortar (khal) with pestle.
 * Pure SVG, no external assets.
 */
export default function HeroIllustration({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 480 560" className={className} role="img" aria-label="Illustration of Ayurvedic herbs and a mortar under a rising sun">
      <defs>
        <linearGradient id="hi-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1E5A43" />
          <stop offset="1" stopColor="#123A2B" />
        </linearGradient>
        <linearGradient id="hi-sun" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F2B562" />
          <stop offset="1" stopColor="#D4862A" />
        </linearGradient>
        <linearGradient id="hi-brass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#E9B66A" />
          <stop offset="0.55" stopColor="#C98B33" />
          <stop offset="1" stopColor="#8E5A1C" />
        </linearGradient>
        <clipPath id="hi-arch">
          <path d="M40 560V200C40 101 130 20 240 20S440 101 440 200V560Z" />
        </clipPath>
      </defs>

      {/* Arch window */}
      <g clipPath="url(#hi-arch)">
        <rect width="480" height="560" fill="url(#hi-sky)" />
        {/* concentric sun rings */}
        <circle cx="240" cy="250" r="170" fill="none" stroke="#FFFFFF" strokeOpacity="0.05" strokeWidth="1.5" />
        <circle cx="240" cy="250" r="130" fill="none" stroke="#FFFFFF" strokeOpacity="0.07" strokeWidth="1.5" />
        <circle cx="240" cy="250" r="88" fill="url(#hi-sun)" />
        {/* distant hills */}
        <path d="M0 400C70 360 130 350 200 372S330 410 480 360V560H0Z" fill="#174634" />
        <path d="M0 440C90 410 170 420 250 440S400 470 480 430V560H0Z" fill="#102F24" />

        {/* Tulsi sprig (left) */}
        <g stroke="#9CC9AA" strokeWidth="3" strokeLinecap="round" fill="none">
          <path d="M120 520C122 450 128 380 150 300" />
          <path d="M150 300C150 285 152 270 156 258" />
        </g>
        <g fill="#5E9879">
          <path d="M150 300c-26-6-44-22-48-42 22 0 42 14 48 42z" />
          <path d="M150 300c22-14 44-16 60-6-14 14-36 16-60 6z" />
          <path d="M140 352c-26-4-46-18-52-38 22-2 44 10 52 38z" />
          <path d="M140 352c20-16 42-20 60-12-12 16-34 20-60 12z" />
          <path d="M131 410c-24-2-44-14-52-32 22-4 42 6 52 32z" />
          <path d="M131 410c18-16 40-22 58-16-10 16-32 22-58 16z" />
        </g>
        <g fill="#B98CC4" opacity="0.9">
          <ellipse cx="156" cy="252" rx="5" ry="9" />
          <ellipse cx="158" cy="236" rx="4" ry="7" />
          <ellipse cx="159" cy="223" rx="3" ry="5" />
        </g>

        {/* Ashwagandha sprig with berries (right) */}
        <g stroke="#9CC9AA" strokeWidth="3" strokeLinecap="round" fill="none">
          <path d="M370 520C366 450 356 390 330 320" />
        </g>
        <g fill="#3B7A5C">
          <path d="M346 370c22-12 46-12 60 0-16 12-40 12-60 0z" />
          <path d="M338 340c-20-14-30-34-26-52 18 8 28 28 26 52z" />
          <path d="M358 430c22-10 44-8 56 4-16 10-38 8-56-4z" />
        </g>
        <g fill="#E0663B">
          <circle cx="326" cy="318" r="7" />
          <circle cx="352" cy="398" r="6" />
          <circle cx="341" cy="356" r="5" />
        </g>
      </g>

      {/* Arch frame */}
      <path
        d="M40 560V200C40 101 130 20 240 20S440 101 440 200V560"
        fill="none"
        stroke="#D4862A"
        strokeOpacity="0.55"
        strokeWidth="2"
      />

      {/* Brass mortar (khal) and pestle, overlapping the frame */}
      <g>
        <path d="M296 400L352 330" stroke="#6B4316" strokeWidth="16" strokeLinecap="round" />
        <path d="M296 400L352 330" stroke="url(#hi-brass)" strokeWidth="12" strokeLinecap="round" />
        <ellipse cx="240" cy="430" rx="110" ry="22" fill="#8E5A1C" />
        <path d="M130 430C134 492 180 530 240 530S346 492 350 430Z" fill="url(#hi-brass)" />
        <ellipse cx="240" cy="430" rx="100" ry="17" fill="#5C3A12" />
        <ellipse cx="240" cy="428" rx="88" ry="12" fill="#3F6B4E" />
        <path d="M200 528H280L292 548H188Z" fill="#8E5A1C" />
        <path d="M168 470C190 482 290 482 312 470" stroke="#FFFFFF" strokeOpacity="0.25" strokeWidth="3" fill="none" strokeLinecap="round" />
      </g>
    </svg>
  );
}
