"""frames2anim.py <frames_dir> <out_base> <fps> - assemble captured frames into a looping GIF and WebP, then delete the frames."""
import os
import shutil
import sys

from PIL import Image

src, out, fps = sys.argv[1], sys.argv[2], int(sys.argv[3])
files = sorted(f for f in os.listdir(src) if f.endswith('.png'))
frames = [Image.open(os.path.join(src, f)).convert('RGB') for f in files]
dur = round(1000 / fps)
frames[0].save(out + '.webp', save_all=True, append_images=frames[1:], duration=dur, loop=0, quality=86, method=4)
pal = [f.quantize(colors=200, method=Image.Quantize.MEDIANCUT) for f in frames]
pal[0].save(out + '.gif', save_all=True, append_images=pal[1:], duration=dur, loop=0, optimize=True)
shutil.rmtree(src)
print(f'{os.path.basename(out)}: {len(frames)} frames -> .gif ({os.path.getsize(out + ".gif") // 1024} KB), .webp ({os.path.getsize(out + ".webp") // 1024} KB)')
