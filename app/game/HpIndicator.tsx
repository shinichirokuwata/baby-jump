// HP display: a row of small white disposable-diaper icons — deliberately
// not hearts/a numeric gauge, per the brief ("BABY JUMPらしく白い紙おむつ").
// Drawn as a plain inline SVG kite/shield silhouette (wide "hips" tapering to
// a rounded point, two side tabs) rather than a photo — at the tiny size
// this renders at, a vector shape stays crisp and reads clearly as "a
// diaper" without needing a new image asset or any library.
function DiaperIcon({ lost }: { lost: boolean }) {
  return (
    <svg
      viewBox="0 0 28 24"
      width={22}
      height={19}
      aria-hidden
      className={`drop-shadow-sm transition-opacity duration-300 ${lost ? "opacity-25" : "opacity-100"}`}
    >
      <path
        d="M8 2C6.5 2 5.5 3 5.5 4.5C5.5 6.5 7.5 8 8.5 10.5C9.5 13 9 16 10 18C10.8 19.8 12.3 21 14 21C15.7 21 17.2 19.8 18 18C19 16 18.5 13 19.5 10.5C20.5 8 22.5 6.5 22.5 4.5C22.5 3 21.5 2 20 2Z"
        fill="#ffffff"
        stroke="#c9ccd3"
        strokeWidth="0.9"
      />
      <rect x="1" y="5" width="4.6" height="4.2" rx="1.4" fill="#ffffff" stroke="#c9ccd3" strokeWidth="0.9" />
      <rect x="22.4" y="5" width="4.6" height="4.2" rx="1.4" fill="#ffffff" stroke="#c9ccd3" strokeWidth="0.9" />
    </svg>
  );
}

export function HpIndicator({ hp, maxHp }: { hp: number; maxHp: number }) {
  return (
    <div className="flex items-center justify-center gap-1.5" aria-label={`HP ${hp}/${maxHp}`}>
      {Array.from({ length: maxHp }, (_, i) => (
        <DiaperIcon key={i} lost={i >= hp} />
      ))}
    </div>
  );
}
