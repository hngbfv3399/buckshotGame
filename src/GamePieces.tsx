import { MAX_HEALTH, type Player, type Shell } from './game'

export function Health({ value, label }: { value: number; label: string }) {
  return <div className="health" role="meter" aria-label={label + ' 체력'} aria-valuemin={0} aria-valuemax={MAX_HEALTH} aria-valuenow={value}>
    {Array.from({ length: MAX_HEALTH }, (_, i) => <span className={i < value ? 'health-unit active' : 'health-unit'} key={i} />)}
  </div>
}
export function Gun({ aimTarget, shotKind }: { aimTarget: Player | null; shotKind: Shell | null }) {
  const className = ['gun', aimTarget ? 'aim-' + aimTarget : '', shotKind ? 'shot-' + shotKind : ''].filter(Boolean).join(' ')
  return <svg className={className} viewBox="0 0 720 230" role="img" aria-label="테이블 위의 산탄총 그림">
    <defs>
      <linearGradient id="steel" x2="0" y2="1"><stop stopColor="#838a7e" /><stop offset=".4" stopColor="#313a35" /><stop offset="1" stopColor="#111916" /></linearGradient>
      <linearGradient id="wood" x2="0" y2="1"><stop stopColor="#a16b41" /><stop offset=".5" stopColor="#603b27" /><stop offset="1" stopColor="#2c1d17" /></linearGradient>
      <filter id="gunShadow"><feDropShadow dx="0" dy="18" stdDeviation="13" floodOpacity=".7" /></filter>
    </defs>
    <g filter="url(#gunShadow)" transform="translate(18 38) rotate(-7 350 80)">
      <path d="M20 82 C44 55 98 43 148 51 L192 65 L195 100 L144 113 C89 122 45 111 20 82Z" fill="url(#wood)" stroke="#1c1814" strokeWidth="5" />
      <path d="M40 82 C80 68 125 68 153 77" fill="none" stroke="#c48b57" strokeOpacity=".5" strokeWidth="4" />
      <path d="M185 58 L298 56 L328 65 L328 102 L295 106 L185 101Z" fill="url(#steel)" stroke="#111715" strokeWidth="5" />
      <path d="M307 63 L668 65 Q684 65 688 73 L688 84 Q682 93 667 93 L307 98Z" fill="url(#steel)" stroke="#111715" strokeWidth="5" />
      <path d="M373 99 L627 98 L629 109 L373 113Z" fill="#29332d" stroke="#101715" strokeWidth="3" />
      <path d="M359 99 L512 98 L518 113 L359 116Z" fill="url(#wood)" stroke="#251b17" strokeWidth="4" />
      <path d="M205 103 L251 105 L240 153 Q229 163 215 158 L197 150 L206 130Z" fill="url(#wood)" stroke="#1c1814" strokeWidth="5" />
      <path d="M249 107 L283 108 Q290 130 275 136 L243 134" fill="none" stroke="#111715" strokeWidth="7" />
      <path d="M265 109 L265 123" stroke="#b9b7a8" strokeWidth="4" />
      <path d="M344 67 L344 96 M360 67 L360 96 M377 67 L377 95" stroke="#a0a79b" strokeOpacity=".45" strokeWidth="3" />
      <path d="M622 70 L669 71" stroke="#b5b9ad" strokeOpacity=".45" strokeWidth="3" />
      <circle cx="298" cy="82" r="5" fill="#c1b49b" />
      <g className="muzzle-flash" transform="translate(689 79)">
        <path d="M0 -27 L8 -10 L28 -16 L16 0 L36 7 L12 10 L17 27 L0 13 L-14 23 L-9 7 L-25 0 L-8 -8Z" fill="#fbe1a1" />
        <circle r="9" fill="#fff7dd" />
      </g>
    </g>
  </svg>
}
