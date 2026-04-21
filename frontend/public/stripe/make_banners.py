"""Generate four square product banners for Wamply plans.

Output: 1024x1024 SVG + PNG per plan (Free-trial, Starter, Professional, Enterprise).
Brand: navy gradient + teal accents + W-wave logo.

Data sourced from supabase/migrations/004_plans_subscriptions.sql
and 018_trial_system.sql (14-day Professional trial on signup).
"""

from pathlib import Path
import cairosvg

OUT = Path(__file__).parent
SIZE = 1024

NAVY_DEEP = "#0B1628"
NAVY = "#1B2A4A"
NAVY_LIGHT = "#132240"
TEAL = "#0D9488"
TEAL_SOFT = "#CCFBF1"
GREEN = "#25D366"  # brand WhatsApp green, defined in globals.css
GREEN_SOFT = "#E8F5E9"
SLATE_LIGHT = "#94A3B8"
WHITE = "#FFFFFF"

# Rendered width (px) of the big number at 180px (DejaVu Bold fallback), tracking -6.
NUM_WIDTH = {"14": 220, "49": 245, "149": 365, "399": 365}


def wave_logo(x, y, size, ring_color=TEAL):
    return f"""
  <g transform="translate({x},{y}) scale({size/400:.4f})">
    <rect width="400" height="400" rx="80" fill="url(#logoBg)"/>
    <path d="M90 140 L130 290 L170 190 L200 290 L230 190 L270 290 L310 140"
          fill="none" stroke="#fff" stroke-width="18"
          stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M90 140 L130 290 L170 190 L200 290 L230 190 L270 290 L310 140"
          fill="none" stroke="{ring_color}" stroke-width="6"
          stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>
    <circle cx="320" cy="132" r="8"  fill="{ring_color}" opacity="0.9"/>
    <circle cx="336" cy="120" r="5"  fill="{ring_color}" opacity="0.6"/>
    <circle cx="348" cy="112" r="3"  fill="{ring_color}" opacity="0.35"/>
  </g>"""


def check_icon(cx, cy, color=TEAL):
    return f"""
    <circle cx="{cx}" cy="{cy}" r="22" fill="{color}" opacity="0.15"/>
    <polyline points="{cx-10},{cy} {cx-3},{cy+8} {cx+12},{cy-10}"
              fill="none" stroke="{color}" stroke-width="5"
              stroke-linecap="round" stroke-linejoin="round"/>"""


def banner_svg(plan):
    accent = plan.get("accent", TEAL)
    accent_soft = plan.get("accent_soft", TEAL_SOFT)
    badge_text = plan.get("badge_text")
    is_trial = plan.get("trial", False)

    # For trial banner we show "14" + "GIORNI GRATIS" instead of money.
    big_number = plan["number"]
    unit_line = plan["unit"]
    sub_label = plan.get("sub_label", "PIANO MENSILE")

    num_width = NUM_WIDTH.get(big_number, 95 * len(big_number))
    rings_opacity = 0.14 if badge_text else 0.08

    rings = f"""
    <g opacity="{rings_opacity}" transform="translate(820,200)">
      <circle r="340" fill="none" stroke="{accent}" stroke-width="2"/>
      <circle r="240" fill="none" stroke="{accent}" stroke-width="2"/>
      <circle r="150" fill="none" stroke="{accent}" stroke-width="2"/>
      <circle r="80"  fill="none" stroke="{accent}" stroke-width="2"/>
    </g>"""

    badge = ""
    if badge_text:
        # Wider badge for longer text ("PROVA GRATUITA")
        w = max(220, len(badge_text) * 13 + 40)
        badge = f"""
    <g transform="translate(80,150)">
      <rect x="0" y="0" width="{w}" height="44" rx="22"
            fill="{accent}" opacity="0.18"/>
      <rect x="0" y="0" width="{w}" height="44" rx="22"
            fill="none" stroke="{accent}" stroke-width="1.5" opacity="0.55"/>
      <text x="{w//2}" y="29" font-family="Inter, system-ui, sans-serif"
            font-size="15" font-weight="600" fill="{accent_soft}"
            text-anchor="middle" letter-spacing="1.5">
        {badge_text}
      </text>
    </g>"""

    feature_rows = ""
    base_y = 720
    for i, feat in enumerate(plan["features"]):
        y = base_y + i * 58
        feature_rows += f"""
    {check_icon(102, y - 8, color=accent)}
    <text x="142" y="{y}" font-family="Inter, system-ui, sans-serif"
          font-size="24" font-weight="400" fill="#E2E8F0">
      {feat}
    </text>"""

    num_color = accent if badge_text else WHITE
    price_glow = ""
    if badge_text:
        price_glow = f"""
    <rect x="60" y="360" width="720" height="240" rx="24"
          fill="{accent}" opacity="0.06"/>
    <rect x="60" y="360" width="720" height="240" rx="24"
          fill="none" stroke="{accent}" stroke-width="1.5" opacity="0.35"/>"""

    # Trial banners: show "gg" (no €) after the number, smaller
    if is_trial:
        unit_symbol = f"""
    <text x="{num_width + 18}" y="-10"
          font-family="Inter, system-ui, sans-serif"
          font-size="60" font-weight="600" fill="{num_color}"
          letter-spacing="1">
      gg
    </text>"""
    else:
        unit_symbol = f"""
    <text x="{num_width + 18}" y="0"
          font-family="Inter, system-ui, sans-serif"
          font-size="96" font-weight="600" fill="{num_color}">
      &#8364;
    </text>"""

    return f"""<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {SIZE} {SIZE}"
     width="{SIZE}" height="{SIZE}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%"  stop-color="{NAVY}"/>
      <stop offset="55%" stop-color="{NAVY_LIGHT}"/>
      <stop offset="100%" stop-color="{NAVY_DEEP}"/>
    </linearGradient>
    <linearGradient id="logoBg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%"  stop-color="{NAVY}"/>
      <stop offset="100%" stop-color="{NAVY_DEEP}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.25" cy="0.15" r="0.9">
      <stop offset="0%"   stop-color="{accent}" stop-opacity="0.20"/>
      <stop offset="60%"  stop-color="{accent}" stop-opacity="0.03"/>
      <stop offset="100%" stop-color="{accent}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="{SIZE}" height="{SIZE}" fill="url(#bg)"/>
  <rect width="{SIZE}" height="{SIZE}" fill="url(#glow)"/>

  {rings}

  {wave_logo(78, 78, 64, ring_color=accent)}
  <text x="160" y="125" font-family="Inter, system-ui, sans-serif"
        font-size="34" font-weight="600" fill="#FFFFFF" letter-spacing="-0.5">
    Wam<tspan fill="{accent}">ply</tspan>
  </text>

  {badge}

  <text x="80" y="290" font-family="Inter, system-ui, sans-serif"
        font-size="72" font-weight="700" fill="#FFFFFF" letter-spacing="-1.5">
    {plan["name"]}
  </text>
  <text x="80" y="325" font-family="Inter, system-ui, sans-serif"
        font-size="18" font-weight="500" fill="{SLATE_LIGHT}"
        letter-spacing="3">
    {sub_label}
  </text>

  {price_glow}
  <g transform="translate(110,520)">
    <text x="0" y="0" font-family="Inter, system-ui, sans-serif"
          font-size="180" font-weight="700" fill="{num_color}"
          letter-spacing="-6">
      {big_number}
    </text>
    {unit_symbol}
    <text x="6" y="58"
          font-family="Inter, system-ui, sans-serif"
          font-size="30" font-weight="400" fill="{SLATE_LIGHT}"
          letter-spacing="2">
      {unit_line}
    </text>
  </g>

  {feature_rows}

  <text x="{SIZE//2}" y="970" font-family="Inter, system-ui, sans-serif"
        font-size="20" font-weight="400" fill="{SLATE_LIGHT}"
        text-anchor="middle" letter-spacing="2">
    Amplify your WhatsApp campaigns with AI
  </text>
</svg>
"""


PLANS = [
    # Free / trial banner — 14 days of Professional (inherits 250 AI credits).
    # Source: ai-credits-plan.md sezione 6.2 + supabase/migrations/018_trial_system.sql.
    {
        "name": "Free Trial",
        "slug": "free",
        "number": "14",
        "unit": "giorni gratis",
        "sub_label": "14 GIORNI DI PROFESSIONAL",
        "badge_text": "PROVA GRATUITA",
        "trial": True,
        "accent": GREEN,
        "accent_soft": GREEN_SOFT,
        "features": [
            "Tutte le funzionalita' Professional",
            "250 crediti AI inclusi",
            "Claude Sonnet + A/B Testing",
            "Nessuna carta richiesta",
        ],
    },
    # Starter — AI available only via BYOK (0 system credits).
    {
        "name": "Starter",
        "slug": "starter",
        "number": "49",
        "unit": "al mese",
        "features": [
            "5 campagne / mese",
            "500 contatti",
            "2.500 messaggi WhatsApp",
            "BYOK: usa la tua API Claude",
        ],
    },
    # Professional — 250 AI credits/month with system key (Sonnet).
    {
        "name": "Professional",
        "slug": "professional",
        "number": "149",
        "unit": "al mese",
        "badge_text": "CONSIGLIATO",
        "features": [
            "20 campagne / mese · 5.000 contatti",
            "15.000 messaggi WhatsApp",
            "250 crediti AI inclusi · Claude Sonnet",
            "A/B Testing + Analytics avanzate",
        ],
    },
    # Enterprise — 2000 AI credits/month + BYOK unlimited + white label.
    {
        "name": "Enterprise",
        "slug": "enterprise",
        "number": "399",
        "unit": "al mese",
        "features": [
            "Campagne illimitate · 50.000 contatti",
            "100.000 messaggi WhatsApp",
            "2.000 crediti AI + BYOK illimitato",
            "White-label + Supporto dedicato",
        ],
    },
]


def main():
    for p in PLANS:
        svg = banner_svg(p)
        svg_path = OUT / f"wamply-{p['slug']}-banner.svg"
        png_path = OUT / f"wamply-{p['slug']}-banner.png"
        svg_path.write_text(svg, encoding="utf-8")
        cairosvg.svg2png(
            bytestring=svg.encode("utf-8"),
            write_to=str(png_path),
            output_width=SIZE,
            output_height=SIZE,
        )
        print(f"wrote {svg_path.name} + {png_path.name}")


if __name__ == "__main__":
    main()
