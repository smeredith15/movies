"""Draw the app icons.

One shape, rendered at each size an installed app asks for: a clapperboard in
the app's ink on the app's accent blue. The blue is the background rather than
the subject because a dark icon disappears into a dark home screen, which is
where this one will live. Drawn large and downsampled so the hinge and the
stripes stay clean at 192 pixels.

    python3 tools/make_icons.py
"""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
ICONS = ROOT / "public" / "icons"

# Straight from src/styles/app.css, so the icon and the app agree.
BLUE = (110, 168, 254)  # --accent
INK = (15, 17, 21)  # --bg
PALE = (232, 234, 237)  # --text
SCALE = 8  # supersampling factor


def clapper_bar(length, height, slant):
    """The hinged stick, drawn flat so it can be rotated into place.

    The stripes are parallelograms rather than rectangles: on a real board they
    lean, and at this size the lean is most of what says "clapperboard".
    """
    bar = Image.new("RGBA", (length, height), (0, 0, 0, 0))
    pen = ImageDraw.Draw(bar)
    pen.rounded_rectangle((0, 0, length - 1, height - 1), radius=height * 0.22, fill=INK)

    stripe = length * 0.105
    gap = stripe * 1.05
    x = -height * slant  # start off the left edge so the first stripe is clipped square
    while x < length + height * slant:
        pen.polygon(
            [
                (x, height),
                (x + stripe, height),
                (x + stripe + height * slant, 0),
                (x + height * slant, 0),
            ],
            fill=PALE,
        )
        x += stripe + gap

    # Clip the stripes back to the bar's rounded outline.
    mask = Image.new("L", (length, height), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, length - 1, height - 1), radius=height * 0.22, fill=255
    )
    bar.putalpha(mask)
    return bar


def draw(size, maskable):
    """Render one icon. Maskable ones keep clear of the edges, since the
    launcher may crop them to a circle."""
    box = size * SCALE
    image = Image.new("RGBA", (box, box), (0, 0, 0, 0))
    pen = ImageDraw.Draw(image)

    # Background: full bleed for maskable, a rounded tile otherwise.
    if maskable:
        pen.rectangle((0, 0, box, box), fill=BLUE)
    else:
        pen.rounded_rectangle((0, 0, box, box), radius=box * 0.22, fill=BLUE)

    inset = box * (0.26 if maskable else 0.17)
    width = box - inset * 2

    # The slate: the board itself, with two lines where the scene is written.
    slate_top = inset + width * 0.36
    pen.rounded_rectangle(
        (inset, slate_top, inset + width, inset + width),
        radius=width * 0.09,
        fill=INK,
    )
    rule = width * 0.035
    for offset in (0.24, 0.46):
        y = slate_top + (inset + width - slate_top) * offset
        pen.rounded_rectangle(
            (inset + width * 0.14, y, inset + width * 0.86, y + rule),
            radius=rule / 2,
            fill=PALE,
        )

    # The stick, hinged at the left and caught mid-clap.
    bar = clapper_bar(int(width), int(width * 0.23), slant=0.34).rotate(
        11, resample=Image.BICUBIC, expand=True
    )
    image.alpha_composite(bar, (int(inset), int(inset + width * 0.02)))

    return image.resize((size, size), Image.LANCZOS)


def main():
    ICONS.mkdir(parents=True, exist_ok=True)
    for size in (192, 512):
        draw(size, maskable=False).save(ICONS / f"icon-{size}.png")
        draw(size, maskable=True).save(ICONS / f"icon-{size}-maskable.png")
    # iOS uses its own, and applies its own rounding, so no transparency.
    apple = Image.new("RGB", (180, 180), BLUE)
    apple.paste(draw(180, maskable=True).convert("RGB"), (0, 0))
    apple.save(ICONS / "apple-touch-icon.png")
    print(f"wrote {len(list(ICONS.glob('*.png')))} icons to {ICONS.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
