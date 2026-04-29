"""Generate brand-consistent SVG placeholder banners for segment images.

Used as fallback when the AI image generator's quota is exhausted.
Each placeholder is a 1536x1024 (3:2) SVG with the Wamply navy/teal
gradient + segment label + simple geometric icon (drawn as SVG paths,
no font dependency).

To replace any placeholder with a real photo:
  1. Generate or source a 1536x1024 .webp
  2. Save as public/segments/<slug>.webp
  3. The frontend prefers .webp over .svg automatically
"""

from pathlib import Path

OUT = Path(__file__).parent
W, H = 1536, 1024

NAVY_DEEP = "#0B1628"
NAVY = "#1B2A4A"
NAVY_LIGHT = "#132240"
TEAL = "#0D9488"
TEAL_SOFT = "#5EEAD4"
SLATE = "#94A3B8"


def _xe(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


# Each icon function returns SVG path/shape content centered on (0,0)
# in a ~200x200 bounding box. Stroke color via fill="..." or stroke="...".
ICONS: dict[str, str] = {
    # medical cross
    "studi_medici": f"""
        <rect x="-30" y="-90" width="60" height="180" rx="8"
              fill="none" stroke="{TEAL_SOFT}" stroke-width="10"/>
        <rect x="-90" y="-30" width="180" height="60" rx="8"
              fill="none" stroke="{TEAL_SOFT}" stroke-width="10"/>
    """,
    # scales of justice (column + horizontal beam + two pans)
    "avvocati": f"""
        <line x1="0" y1="-90" x2="0" y2="90"
              stroke="{TEAL_SOFT}" stroke-width="8" stroke-linecap="round"/>
        <line x1="-95" y1="-65" x2="95" y2="-65"
              stroke="{TEAL_SOFT}" stroke-width="8" stroke-linecap="round"/>
        <path d="M -95 -65 L -125 5 A 30 18 0 0 0 -65 5 Z"
              fill="none" stroke="{TEAL_SOFT}" stroke-width="6"/>
        <path d="M  95 -65 L  65 5 A 30 18 0 0 0 125 5 Z"
              fill="none" stroke="{TEAL_SOFT}" stroke-width="6"/>
        <rect x="-30" y="80" width="60" height="14" rx="4"
              fill="{TEAL_SOFT}"/>
    """,
    # house outline with chimney
    "immobiliari": f"""
        <path d="M -100 0 L 0 -90 L 100 0 L 100 90 L -100 90 Z"
              fill="none" stroke="{TEAL_SOFT}" stroke-width="9" stroke-linejoin="round"/>
        <rect x="-20" y="30" width="40" height="60" fill="none"
              stroke="{TEAL_SOFT}" stroke-width="6"/>
        <rect x="55" y="-65" width="20" height="35" fill="{TEAL_SOFT}"/>
    """,
    # gear (8 teeth circle)
    "autofficine": f"""
        <g fill="none" stroke="{TEAL_SOFT}" stroke-width="9" stroke-linejoin="round">
          <circle r="55"/>
          <path d="M 0 -100 L 14 -100 L 14 -75 L -14 -75 L -14 -100 Z"/>
          <path d="M 0 100 L 14 100 L 14 75 L -14 75 L -14 100 Z"/>
          <path d="M -100 0 L -100 14 L -75 14 L -75 -14 L -100 -14 Z"/>
          <path d="M 100 0 L 100 14 L 75 14 L 75 -14 L 100 -14 Z"/>
          <path d="M -71 -71 L -60 -82 L -42 -64 L -64 -42 L -82 -60 Z"/>
          <path d="M  71 -71 L  60 -82 L  42 -64 L  64 -42 L  82 -60 Z"/>
          <path d="M -71  71 L -60  82 L -42  64 L -64  42 L -82  60 Z"/>
          <path d="M  71  71 L  60  82 L  42  64 L  64  42 L  82  60 Z"/>
        </g>
        <circle r="20" fill="{TEAL_SOFT}"/>
    """,
    # shopping bag with handle
    "retail": f"""
        <path d="M -90 -30 L 90 -30 L 75 100 L -75 100 Z"
              fill="none" stroke="{TEAL_SOFT}" stroke-width="9" stroke-linejoin="round"/>
        <path d="M -50 -30 A 50 50 0 0 1 50 -30"
              fill="none" stroke="{TEAL_SOFT}" stroke-width="9"/>
    """,
    # open book
    "scuole": f"""
        <path d="M -110 -50 Q -55 -65 0 -50 L 0 80 Q -55 65 -110 80 Z"
              fill="none" stroke="{TEAL_SOFT}" stroke-width="8" stroke-linejoin="round"/>
        <path d="M  110 -50 Q  55 -65 0 -50 L 0 80 Q  55 65 110 80 Z"
              fill="none" stroke="{TEAL_SOFT}" stroke-width="8" stroke-linejoin="round"/>
        <line x1="-90" y1="-30" x2="-20" y2="-37" stroke="{TEAL_SOFT}" stroke-width="3" opacity="0.6"/>
        <line x1="-90" y1="-5"  x2="-20" y2="-12" stroke="{TEAL_SOFT}" stroke-width="3" opacity="0.6"/>
        <line x1="-90" y1="20"  x2="-20" y2="13"  stroke="{TEAL_SOFT}" stroke-width="3" opacity="0.6"/>
        <line x1=" 20" y1="-37" x2=" 90" y2="-30" stroke="{TEAL_SOFT}" stroke-width="3" opacity="0.6"/>
        <line x1=" 20" y1="-12" x2=" 90" y2="-5"  stroke="{TEAL_SOFT}" stroke-width="3" opacity="0.6"/>
        <line x1=" 20" y1="13"  x2=" 90" y2="20"  stroke="{TEAL_SOFT}" stroke-width="3" opacity="0.6"/>
    """,
    # bed with pillow + headboard
    "hotel": f"""
        <path d="M -110 -10 L -110 -60 L 110 -60 L 110 -10"
              fill="none" stroke="{TEAL_SOFT}" stroke-width="8" stroke-linecap="round"/>
        <rect x="-110" y="-10" width="220" height="60" rx="8"
              fill="none" stroke="{TEAL_SOFT}" stroke-width="9"/>
        <rect x="-95" y="-40" width="60" height="30" rx="6" fill="{TEAL_SOFT}" opacity="0.6"/>
        <line x1="-110" y1="50" x2="-110" y2="80" stroke="{TEAL_SOFT}" stroke-width="8" stroke-linecap="round"/>
        <line x1=" 110" y1="50" x2=" 110" y2="80" stroke="{TEAL_SOFT}" stroke-width="8" stroke-linecap="round"/>
    """,
    # car silhouette (side view)
    "autosaloni": f"""
        <path d="M -120 30 L -100 -10 Q -80 -45 -40 -45 L 40 -45 Q 80 -45 100 -10 L 120 30 Z"
              fill="none" stroke="{TEAL_SOFT}" stroke-width="9" stroke-linejoin="round"/>
        <path d="M -90 -10 L -55 -35 L 0 -35 L 0 -10 Z M 0 -10 L 0 -35 L 55 -35 L 90 -10 Z"
              fill="none" stroke="{TEAL_SOFT}" stroke-width="6" opacity="0.7"/>
        <circle cx="-65" cy="35" r="22" fill="none" stroke="{TEAL_SOFT}" stroke-width="9"/>
        <circle cx=" 65" cy="35" r="22" fill="none" stroke="{TEAL_SOFT}" stroke-width="9"/>
        <circle cx="-65" cy="35" r="6" fill="{TEAL_SOFT}"/>
        <circle cx=" 65" cy="35" r="6" fill="{TEAL_SOFT}"/>
    """,
    # shopping basket with bottle / loaf: alimentari & botteghe
    "alimentari": f"""
        <g fill="none" stroke="{TEAL_SOFT}" stroke-width="8" stroke-linejoin="round" stroke-linecap="round">
          <path d="M -110 -10 L -85 75 Q -80 95 -55 95 L 55 95 Q 80 95 85 75 L 110 -10 Z"/>
          <line x1="-110" y1="-10" x2="110" y2="-10"/>
          <line x1="-72" y1="20" x2="-72" y2="80"/>
          <line x1="-30" y1="20" x2="-30" y2="80"/>
          <line x1=" 15" y1="20" x2=" 15" y2="80"/>
          <line x1=" 60" y1="20" x2=" 60" y2="80"/>
        </g>
        <rect x="-25" y="-72" width="22" height="62" rx="3" fill="none" stroke="{TEAL_SOFT}" stroke-width="6"/>
        <rect x="-19" y="-78" width="10" height="8" fill="{TEAL_SOFT}" opacity="0.6"/>
        <ellipse cx="35" cy="-45" rx="42" ry="22" fill="none" stroke="{TEAL_SOFT}" stroke-width="6"/>
    """,
    # cheese wheel + wedge cut: caseifici & latticini
    "caseifici": f"""
        <g fill="none" stroke="{TEAL_SOFT}" stroke-width="9" stroke-linejoin="round">
          <circle r="100"/>
          <path d="M -50 -86 L 50 -86 Q 60 -55 60 -25 L -60 -25 Q -60 -55 -50 -86 Z"
                fill="{TEAL_SOFT}" fill-opacity="0.18"/>
        </g>
        <circle cx="-30" cy="20" r="8" fill="{TEAL_SOFT}" opacity="0.7"/>
        <circle cx=" 25" cy="40" r="6" fill="{TEAL_SOFT}" opacity="0.7"/>
        <circle cx=" 50" cy=" 0" r="5" fill="{TEAL_SOFT}" opacity="0.7"/>
        <circle cx="-55" cy="-10" r="4" fill="{TEAL_SOFT}" opacity="0.7"/>
    """,
}

LABELS = {
    "studi_medici": "Studi Medici",
    "avvocati": "Avvocati",
    "immobiliari": "Immobiliari",
    "autofficine": "Autofficine",
    "retail": "Retail",
    "scuole": "Scuole",
    "hotel": "Hotel & B&B",
    "autosaloni": "Autosaloni",
    "alimentari": "Alimentari & Botteghe",
    "caseifici": "Caseifici & Latticini",
}


def banner(slug: str) -> str:
    label = LABELS[slug]
    icon = ICONS[slug]
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%"  stop-color="{NAVY}"/>
      <stop offset="55%" stop-color="{NAVY_LIGHT}"/>
      <stop offset="100%" stop-color="{NAVY_DEEP}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.7" cy="0.3" r="0.7">
      <stop offset="0%"   stop-color="{TEAL}" stop-opacity="0.30"/>
      <stop offset="55%"  stop-color="{TEAL}" stop-opacity="0.05"/>
      <stop offset="100%" stop-color="{TEAL}" stop-opacity="0"/>
    </radialGradient>
    <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
      <path d="M 48 0 L 0 0 0 48" fill="none" stroke="{TEAL}" stroke-width="0.5" opacity="0.10"/>
    </pattern>
  </defs>

  <rect width="{W}" height="{H}" fill="url(#bg)"/>
  <rect width="{W}" height="{H}" fill="url(#grid)"/>
  <rect width="{W}" height="{H}" fill="url(#glow)"/>

  <!-- decorative concentric rings, top-right -->
  <g opacity="0.10" transform="translate({W * 0.78},{H * 0.32})">
    <circle r="380" fill="none" stroke="{TEAL}" stroke-width="1.5"/>
    <circle r="260" fill="none" stroke="{TEAL}" stroke-width="1.5"/>
    <circle r="160" fill="none" stroke="{TEAL}" stroke-width="1.5"/>
    <circle r="80"  fill="none" stroke="{TEAL}" stroke-width="1.5"/>
  </g>

  <!-- icon, large and centered-left -->
  <g transform="translate({W * 0.18},{H * 0.5})">
    <circle r="170" fill="{TEAL}" opacity="0.10"/>
    <circle r="170" fill="none" stroke="{TEAL}" stroke-width="1.5" opacity="0.40"/>
    {icon}
  </g>

  <!-- segment label -->
  <text x="{W * 0.36}" y="{H * 0.46}"
        font-family="Inter, system-ui, sans-serif" font-size="22" font-weight="500"
        fill="{SLATE}" letter-spacing="6">PER</text>
  <text x="{W * 0.36}" y="{H * 0.60}"
        font-family="Inter, system-ui, sans-serif" font-size="76" font-weight="700"
        fill="#FFFFFF" letter-spacing="-1.5">{_xe(label)}</text>
  <text x="{W * 0.36}" y="{H * 0.68}"
        font-family="Inter, system-ui, sans-serif" font-size="18" font-weight="400"
        fill="{SLATE}" letter-spacing="2">Wam<tspan fill="{TEAL_SOFT}">ply</tspan> per il tuo settore</text>
</svg>
"""


def main():
    for slug in ICONS:
        path = OUT / f"{slug}.svg"
        path.write_text(banner(slug), encoding="utf-8")
        print(f"wrote {path.name}")
    print(f"\nDone: {len(ICONS)} placeholders.")


if __name__ == "__main__":
    main()
