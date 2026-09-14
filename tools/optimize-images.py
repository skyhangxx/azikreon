"""Create WebP delivery assets, preserving original PNG files."""
from pathlib import Path
import re
from PIL import Image

root = Path(__file__).resolve().parent.parent
sources = list(root.glob('*.html')) + list(root.glob('*/index.html')) + list(root.glob('*/*/index.html')) + list((root / 'assets/css').glob('*.css')) + list((root / 'assets/js').glob('*.js'))
contents = {p: p.read_text(encoding='utf-8') for p in sources}
images = set()
for text in contents.values():
    for match in re.findall(r'(?:/assets/images/|assets/images/|\.\./images/)([^\s\)\"\'<>]+\.png)', text):
        path = root / 'assets/images' / match
        if path.is_file():
            images.add(path)
images.update((root / 'assets/images/current').glob('result-ring-*.png'))
before = after = 0
sizes = {}
for path in sorted(images):
    target = path.with_suffix('.webp')
    with Image.open(path) as im:
        sizes[path.relative_to(root).as_posix()] = im.size
        im.save(target, 'WEBP', quality=90, method=6)
    before += path.stat().st_size
    after += target.stat().st_size
for path, text in contents.items():
    for image in images:
        relative = image.relative_to(root / 'assets/images').as_posix()
        for prefix in ['/assets/images/', 'assets/images/', '../images/']:
            text = text.replace(prefix + relative, prefix + relative[:-4] + '.webp')
    if path.name == 'result.js':
        text = text.replace("result.test_score + '.png'", "result.test_score + '.webp'")
    if path.suffix == '.html':
        def enhance(match):
            tag = match.group()
            src = re.search(r'src="([^"]+)"', tag)
            if not src:
                return tag
            key = src[1].lstrip('/').replace('.webp', '.png')
            if key in sizes:
                width, height = sizes[key]
                if not re.search(r'\bwidth=', tag):
                    tag = tag[:-1] + f' width="{width}"' + '>'
                if not re.search(r'\bheight=', tag):
                    tag = tag[:-1] + f' height="{height}"' + '>'
            if 'decoding=' not in tag:
                tag = tag[:-1] + ' decoding="async">'
            below_hero = path.name == 'index.html' and path.parent == root and match.start() > text.find('id="audience-title"')
            if below_hero and 'loading=' not in tag:
                tag = tag[:-1] + ' loading="lazy">'
            return tag
        text = re.sub(r'<img\b[^>]*>', enhance, text)
    if text != contents[path]:
        path.write_text(text, encoding='utf-8')
print(f'{len(images)} images: {before:,} -> {after:,} bytes ({(1-after/before)*100:.1f}% smaller)')
