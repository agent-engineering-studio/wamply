"""Generate the 8 missing AI segment images via Hugging Face Inference API
(FLUX.1-schnell). Uses serverless inference instead of ZeroGPU spaces, so the
quota is separate from the in-MCP `gr1_z_image_turbo_generate` tool.

Run with your Hugging Face token (free HF account works):

    # bash
    HF_TOKEN=hf_xxxxxxxxxxxxxxxxxxxxx \\
      /c/Users/GiuseppeZileni/Git/wamply/backend/.venv/Scripts/python.exe \\
      generate_ai_images.py

    # PowerShell
    $env:HF_TOKEN = 'hf_xxxxxxxxxxxxxxxxxxxxx'
    & 'C:\\Users\\GiuseppeZileni\\Git\\wamply\\backend\\.venv\\Scripts\\python.exe' generate_ai_images.py

What it does:
  - For each segment slug below, calls FLUX.1-schnell with the same prompt+seed
    family used for the 3 already-generated .webp (parrucchieri/ristoranti/palestre).
  - Saves the result to public/segments/<slug>.webp (1536x1024).
  - Removes the corresponding <slug>.svg placeholder.
  - Patches frontend/src/lib/plans.ts to reference the .webp instead of .svg.
  - Idempotent: skips slugs whose .webp already exists.

Requirements:
  pip install huggingface_hub Pillow
  An HF_TOKEN with read access (Settings → Access Tokens, type: Read).
"""

import os
import re
import sys
import time
from pathlib import Path

try:
    from huggingface_hub import InferenceClient
except ImportError:
    print("Missing huggingface_hub. Install with: pip install huggingface_hub", file=sys.stderr)
    sys.exit(1)


HERE = Path(__file__).parent
PLANS_TS = HERE.parent.parent / "src" / "lib" / "plans.ts"
MODEL = "black-forest-labs/FLUX.1-schnell"
WIDTH, HEIGHT = 1536, 1024
COMMON_STYLE = (
    "soft warm afternoon light, depth of field, brass details, "
    "navy and teal accent colors, no people, lifestyle photography, "
    "premium but approachable feel"
)

SEGMENTS: list[tuple[str, int, str]] = [
    (
        "studi_medici", 300,
        "Modern minimalist medical office reception, white walls, plants, "
        "wooden floor, clean and serene clinic feel, " + COMMON_STYLE,
    ),
    (
        "avvocati", 400,
        "Elegant law office, dark wooden bookshelf with leather books, "
        "wooden desk with brass lamp, leather chair, premium professional feel, "
        + COMMON_STYLE,
    ),
    (
        "immobiliari", 500,
        "Modern real estate agency interior, framed property photos on white wall, "
        "wooden desk with laptop, large window with city view, " + COMMON_STYLE,
    ),
    (
        "autofficine", 600,
        "Clean modern auto workshop, organized tool wall, polished concrete floor, "
        "classic car partial view, premium artisan workshop feel, organized and tidy, "
        + COMMON_STYLE,
    ),
    (
        "retail", 700,
        "Small Italian boutique shop interior, curated clothing on wooden display rack, "
        "marble counter, large window, premium boutique feel, " + COMMON_STYLE,
    ),
    (
        "scuole", 800,
        "Modern coworking learning space, wooden tables, books and laptops, "
        "plants, large window, inspiring educational feel, " + COMMON_STYLE,
    ),
    (
        "hotel", 900,
        "Cozy boutique hotel lobby, leather sofa, indoor plants, brass floor lamp, "
        "marble side table, fireplace, wooden floor, soft warm evening light, "
        "premium hospitality feel, " + COMMON_STYLE,
    ),
    (
        "autosaloni", 1000,
        "Modern car dealership showroom, polished glossy floor reflecting one "
        "classic luxury car partial view, large windows, premium showroom feel, "
        "minimalist, " + COMMON_STYLE,
    ),
    (
        "alimentari", 1100,
        "Italian village grocery shop interior, wooden shelves with bottles of "
        "wine and olive oil, jars of preserves and conserves, hanging cured "
        "salumi, baskets with fresh bread loaves and pasta, marble counter, "
        "warm light through window, premium artisan general store feel, "
        + COMMON_STYLE,
    ),
    (
        "caseifici", 1200,
        "Italian small dairy / caseificio interior, glass display with white "
        "fresh mozzarella balls in clear water, large parmesan cheese wheels "
        "stacked on wooden shelves, marble counter, copper kettle in the "
        "background, warm light, premium artisan dairy feel, " + COMMON_STYLE,
    ),
]


def patch_plans_ts(slug: str) -> bool:
    """Update lib/plans.ts to point /segments/<slug>.svg -> .webp."""
    if not PLANS_TS.exists():
        print(f"  [warn] {PLANS_TS} not found, skipping plans.ts patch")
        return False
    src = PLANS_TS.read_text(encoding="utf-8")
    pattern = re.compile(rf'(/segments/{re.escape(slug)})\.svg\b')
    new_src, n = pattern.subn(r"\1.webp", src)
    if n > 0:
        PLANS_TS.write_text(new_src, encoding="utf-8")
        print(f"  patched plans.ts: {slug}.svg -> .webp")
        return True
    return False


def generate(client: InferenceClient, slug: str, seed: int, prompt: str) -> bool:
    target = HERE / f"{slug}.webp"
    if target.exists():
        print(f"[skip] {slug}.webp already exists ({target.stat().st_size // 1024} KB)")
        return False

    print(f"[generate] {slug} (seed={seed})...", flush=True)
    try:
        img = client.text_to_image(
            prompt=prompt,
            model=MODEL,
            width=WIDTH,
            height=HEIGHT,
            num_inference_steps=4,  # FLUX-schnell is optimized for 1-4 steps
            seed=seed,
        )
    except Exception as exc:  # noqa: BLE001
        print(f"  ERROR: {type(exc).__name__}: {str(exc)[:300]}", file=sys.stderr)
        return False

    img.save(target, "WEBP", quality=85)
    size_kb = target.stat().st_size // 1024
    print(f"  saved {target.name} ({size_kb} KB, {img.size[0]}x{img.size[1]})")

    svg_path = HERE / f"{slug}.svg"
    if svg_path.exists():
        svg_path.unlink()
        print(f"  removed {svg_path.name}")
    patch_plans_ts(slug)
    return True


def main() -> int:
    token = os.environ.get("HF_TOKEN") or os.environ.get("HUGGING_FACE_HUB_TOKEN")
    if not token:
        print(
            "Set HF_TOKEN with a Hugging Face token (free HF account works).\n"
            "Get one at: https://huggingface.co/settings/tokens",
            file=sys.stderr,
        )
        return 1

    print(f"Using model: {MODEL}")
    print(f"Output dir: {HERE}")
    client = InferenceClient(token=token)

    generated = 0
    skipped = 0
    failed: list[str] = []
    for slug, seed, prompt in SEGMENTS:
        target = HERE / f"{slug}.webp"
        if target.exists():
            print(f"[skip] {slug}.webp already exists")
            skipped += 1
            continue

        if generate(client, slug, seed, prompt):
            generated += 1
            time.sleep(2)  # be gentle with the inference API
        else:
            failed.append(slug)
            time.sleep(2)

    print()
    print(f"Done. generated={generated}, skipped={skipped}, failed={len(failed)}")
    if failed:
        print(f"  failed slugs: {', '.join(failed)}")
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
