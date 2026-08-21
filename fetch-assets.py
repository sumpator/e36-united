#!/usr/bin/env python3
"""
Jednorázová migrace obrázků z Wix CDN do lokální složky.

Spuštění:
    python -m pip install requests
    python fetch-assets.py

Skript projde HTML, CSS i JS, stáhne původní Wix soubory a přepíše
všechny odkazy na lokální assets/images/migrated/...
"""
from __future__ import annotations
import hashlib
import re
import shutil
from pathlib import Path
from urllib.parse import urlsplit

import requests

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "assets" / "images" / "migrated"
OUT.mkdir(parents=True, exist_ok=True)
FILES = [
    ROOT / "index.html",
    ROOT / "o-nas.html",
    ROOT / "galerie.html",
    ROOT / "assets" / "css" / "styles.css",
    ROOT / "assets" / "js" / "main.js",
]
URL_RE = re.compile(r'https://static\.wixstatic\.com/media/[^"\'<>\s)]+')


def original_wix_url(url: str) -> str:
    return url.split('/v1/', 1)[0]


def local_name(origin: str) -> str:
    path = urlsplit(origin).path
    name = Path(path).name
    safe = re.sub(r'[^A-Za-z0-9._~-]+', '-', name)
    if not safe or '.' not in safe:
        safe = hashlib.sha1(origin.encode()).hexdigest()[:16] + '.jpg'
    return safe


def main() -> None:
    session = requests.Session()
    session.headers.update({
        'User-Agent': 'Mozilla/5.0 (compatible; E36UnitedMigration/2.0)',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    })

    occurrences: dict[str, set[Path]] = {}
    for file in FILES:
        if not file.exists():
            continue
        text = file.read_text(encoding='utf-8')
        for remote in set(URL_RE.findall(text)):
            occurrences.setdefault(remote, set()).add(file)

    origin_to_local: dict[str, str] = {}
    failures: list[tuple[str, str]] = []

    for remote in sorted(occurrences):
        origin = original_wix_url(remote)
        filename = local_name(origin)
        target = OUT / filename
        local = f'assets/images/migrated/{filename}'

        if origin not in origin_to_local:
            try:
                if not target.exists() or target.stat().st_size == 0:
                    print(f'Downloading {origin}')
                    response = session.get(origin, timeout=45)
                    response.raise_for_status()
                    target.write_bytes(response.content)
                origin_to_local[origin] = local
            except Exception as exc:
                failures.append((origin, str(exc)))
                print(f'FAILED: {origin}\n  {exc}')
                continue

    replacements = 0
    for file in FILES:
        if not file.exists():
            continue
        original_text = file.read_text(encoding='utf-8')
        text = original_text
        for remote in occurrences:
            origin = original_wix_url(remote)
            local = origin_to_local.get(origin)
            if local:
                # main.js / CSS / HTML are all located at different depths.
                if file.parent == ROOT:
                    relative = local
                elif file.parent == ROOT / 'assets' / 'js' or file.parent == ROOT / 'assets' / 'css':
                    relative = '../images/migrated/' + Path(local).name
                else:
                    relative = local
                text = text.replace(remote, relative)
        if text != original_text:
            backup = file.with_suffix(file.suffix + '.bak')
            if not backup.exists():
                shutil.copy2(file, backup)
            file.write_text(text, encoding='utf-8')
            replacements += 1

    print(f'\nStaženo: {len(origin_to_local)} unikátních obrázků.')
    print(f'Přepsané soubory: {replacements}.')
    if failures:
        print(f'Nepodařilo se stáhnout: {len(failures)} souborů. Ty zůstaly na Wix CDN.')
    else:
        print('Web už na Wix CDN pro obrázky neodkazuje.')


if __name__ == '__main__':
    main()
