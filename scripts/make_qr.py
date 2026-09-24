#!/usr/bin/env python3
"""Génère assets/qr.png à partir de l'URL du site.

Usage :
    python3 scripts/make_qr.py https://alice-et-max.github.io/wedding/
    python3 scripts/make_qr.py --url https://alice-et-max.github.io/wedding/
"""
import argparse
import re
import sys
from pathlib import Path

OUTPUT_PATH = Path(__file__).resolve().parent.parent / "assets" / "qr.png"
PLACEHOLDER_PATTERN = re.compile(r"^\s*\[.*\]\s*$")
QR_BOX_SIZE = 12
QR_BORDER_MODULES = 4


def parse_arguments() -> str:
    parser = argparse.ArgumentParser(description="Génère assets/qr.png pour le faire-part.")
    parser.add_argument("site_url", nargs="?", help="URL publique du site")
    parser.add_argument("--url", dest="option_url", help="URL publique du site")
    parsed = parser.parse_args()

    site_url = parsed.option_url or parsed.site_url
    if not site_url:
        parser.error("indiquez l'URL du site (argument ou --url).")
    return site_url.strip()


def looks_like_placeholder(site_url: str) -> bool:
    if PLACEHOLDER_PATTERN.match(site_url):
        return True
    return not site_url.lower().startswith(("http://", "https://"))


def build_qr_image(site_url: str):
    try:
        import qrcode
    except ImportError:
        sys.exit("Le paquet 'qrcode' est manquant. Installez-le avec : pip install \"qrcode[pil]\"")

    qr_code = qrcode.QRCode(
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=QR_BOX_SIZE,
        border=QR_BORDER_MODULES,
    )
    qr_code.add_data(site_url)
    qr_code.make(fit=True)
    return qr_code.make_image(fill_color="black", back_color="white")


def main() -> None:
    site_url = parse_arguments()
    if looks_like_placeholder(site_url):
        sys.exit(f"Refus : « {site_url} » ressemble à un placeholder. Indiquez la vraie URL (https://...).")

    qr_image = build_qr_image(site_url)
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    qr_image.save(OUTPUT_PATH)
    print(f"QR code écrit dans {OUTPUT_PATH} pour {site_url}")


if __name__ == "__main__":
    main()
