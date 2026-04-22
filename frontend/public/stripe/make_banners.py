"""Generate four square product banners per language (IT + EN).

Output: 1024x1024 PNG + SVG per plan, per locale.
Layout:
  wamply-free-banner.png          (IT - default, root)
  wamply-starter-banner.png
  wamply-professional-banner.png
  wamply-enterprise-banner.png
  en/wamply-free-banner.png       (EN version)
  en/...

Brand: navy gradient + teal accents + W-wave logo.
Data from ai-credits-plan.md v2 (silent model routing, no model names on banners).
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
GREEN = "#25D366"
GREEN_SOFT = "#E8F5E9"
SLATE_LIGHT = "#94A3B8"
WHITE = "#FFFFFF"

NUM_WIDTH = {"14": 220, "79": 245, "249": 365, "799": 365}


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


def banner_svg(plan, strings):
    accent = plan.get("accent", TEAL)
    accent_soft = plan.get("accent_soft", TEAL_SOFT)
    badge_text = plan.get("badge_text")
    is_trial = plan.get("trial", False)

    big_number = plan["number"]
    unit_line = plan["unit"]
    sub_label = plan.get("sub_label", strings["sub_label_monthly"])

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

    if is_trial:
        unit_symbol = f"""
    <text x="{num_width + 18}" y="-10"
          font-family="Inter, system-ui, sans-serif"
          font-size="60" font-weight="600" fill="{num_color}"
          letter-spacing="1">
      {strings["days_symbol"]}
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
    {strings["tagline"]}
  </text>
</svg>
"""


# Language-specific strings
LOCALES = {
    "it": {
        "sub_label_monthly": "PIANO MENSILE",
        "days_symbol": "gg",
        "tagline": "Amplify your WhatsApp campaigns with AI",
        "plans": [
            {
                "name": "Free Trial", "slug": "free", "number": "14",
                "unit": "giorni gratis",
                "sub_label": "14 GIORNI DI PROFESSIONAL",
                "badge_text": "PROVA GRATUITA", "trial": True,
                "accent": GREEN, "accent_soft": GREEN_SOFT,
                "features": [
                    "Tutte le funzionalita' Professional",
                    "50 crediti AI inclusi",
                    "100 messaggi WhatsApp sandbox",
                    "Nessuna carta richiesta",
                ],
            },
            {
                "name": "Starter", "slug": "starter", "number": "79", "unit": "al mese",
                "features": [
                    "5 campagne / mese . 500 contatti",
                    "500 messaggi WhatsApp",
                    "5 template . 1 utente",
                    "BYOK: porta la tua API Claude",
                ],
            },
            {
                "name": "Professional", "slug": "professional", "number": "249",
                "unit": "al mese", "badge_text": "CONSIGLIATO",
                "features": [
                    "20 campagne / mese . 5.000 contatti",
                    "2.500 messaggi WhatsApp",
                    "200 crediti AI/mese inclusi",
                    "A/B Testing + Analytics avanzate",
                ],
            },
            {
                "name": "Enterprise", "slug": "enterprise", "number": "799",
                "unit": "al mese",
                "features": [
                    "Campagne illimitate . 50.000 contatti",
                    "10.000 messaggi WhatsApp",
                    "1.500 crediti AI + BYOK illimitato",
                    "Account manager dedicato",
                ],
            },
        ],
    },
    "en": {
        "sub_label_monthly": "MONTHLY PLAN",
        "days_symbol": "days",
        "tagline": "Amplify your WhatsApp campaigns with AI",
        "plans": [
            {
                "name": "Free Trial", "slug": "free", "number": "14",
                "unit": "days free",
                "sub_label": "14 DAYS OF PROFESSIONAL",
                "badge_text": "FREE TRIAL", "trial": True,
                "accent": GREEN, "accent_soft": GREEN_SOFT,
                "features": [
                    "All Professional features",
                    "50 AI credits included",
                    "100 sandbox WhatsApp messages",
                    "No credit card required",
                ],
            },
            {
                "name": "Starter", "slug": "starter", "number": "79", "unit": "per month",
                "features": [
                    "5 campaigns / month . 500 contacts",
                    "500 WhatsApp messages",
                    "5 templates . 1 user",
                    "BYOK: bring your Claude API key",
                ],
            },
            {
                "name": "Professional", "slug": "professional", "number": "249",
                "unit": "per month", "badge_text": "RECOMMENDED",
                "features": [
                    "20 campaigns / month . 5,000 contacts",
                    "2,500 WhatsApp messages",
                    "200 AI credits/month included",
                    "A/B Testing + Advanced analytics",
                ],
            },
            {
                "name": "Enterprise", "slug": "enterprise", "number": "799",
                "unit": "per month",
                "features": [
                    "Unlimited campaigns . 50,000 contacts",
                    "10,000 WhatsApp messages",
                    "1,500 AI credits + Unlimited BYOK",
                    "Dedicated account manager",
                ],
            },
        ],
    },
}

# Fix trial unit_gg string replace (SVG render needs proper width)
# Rebuilding NUM_WIDTH for en days rendering (not needed since we use number width only)


def main():
    for lang, data in LOCALES.items():
        out_dir = OUT if lang == "it" else OUT / "en"
        out_dir.mkdir(exist_ok=True)
        for plan in data["plans"]:
            svg = banner_svg(plan, data)
            svg_path = out_dir / f"wamply-{plan['slug']}-banner.svg"
            png_path = out_dir / f"wamply-{plan['slug']}-banner.png"
            svg_path.write_text(svg, encoding="utf-8")
            cairosvg.svg2png(
                bytestring=svg.encode("utf-8"),
                write_to=str(png_path),
                output_width=SIZE,
                output_height=SIZE,
            )
            print(f"[{lang}] wrote {png_path.relative_to(OUT)}")


if __name__ == "__main__":
    main()
