# Cuts the hosts out of the thumbnail frames (docs/specs/011-thumbnails.md), so the Studio can stand
# them over the AI background: the "Host over AI image" option. rembg (MIT) with its u2net_human_seg
# model (U^2-Net, Apache-2.0), trained on people only, so a lamp or a bookshelf behind a host stays out.
# A few stills on the runner's CPU: the model loads in about 3 s and each frame takes under a second.
#
# Run by agent/src/podcast/cutout.ts with the venv that podcast_thumbnails.yml makes from
# agent/requirements-cutout.txt:
#   python cutout.py <frame.jpg> <cutout.png> [<frame.jpg> <cutout.png> ...]
# Each cut-out is a PNG with alpha, cropped to the people in it. Prints one JSON line per frame:
#   {"in": "...", "ok": true, "box": [left, top, right, bottom], "share": 0.31}
#   {"in": "...", "ok": false, "reason": "..."}

import json
import sys

from PIL import Image
from rembg import new_session, remove

MODEL = 'u2net_human_seg'
# Pixels at least this opaque count as the person (the edges fade below it).
SOLID = 25
# A frame where the people cover less than this share of the picture has nobody worth cutting out.
MIN_SHARE = 0.03
# Kept around the people when cropping, so the soft edge is not cut off.
PAD = 4


def say(**fields):
    print(json.dumps(fields), flush=True)


def cut_one(session, src, dst):
    image = Image.open(src).convert('RGB')
    cut = remove(image, session=session, post_process_mask=True)
    alpha = cut.getchannel('A')
    share = sum(alpha.histogram()[SOLID:]) / (image.width * image.height)
    box = alpha.point(lambda v: 255 if v >= SOLID else 0).getbbox()
    if not box or share < MIN_SHARE:
        say(**{'in': src, 'ok': False, 'reason': 'no person found'})
        return
    left, top, right, bottom = box
    box = (max(0, left - PAD), max(0, top - PAD), min(image.width, right + PAD), min(image.height, bottom + PAD))
    cut.crop(box).save(dst, optimize=True)
    say(**{'in': src, 'ok': True, 'box': list(box), 'share': round(share, 3)})


def main(args):
    if not args or len(args) % 2:
        raise SystemExit('usage: cutout.py <frame> <cutout.png> [<frame> <cutout.png> ...]')
    session = new_session(MODEL)
    for src, dst in zip(args[::2], args[1::2]):
        # One frame that fails only costs its cut-out.
        try:
            cut_one(session, src, dst)
        except Exception as error:  # noqa: BLE001 — reported, never fatal
            say(**{'in': src, 'ok': False, 'reason': str(error)[:300]})


if __name__ == '__main__':
    main(sys.argv[1:])
