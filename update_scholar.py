#!/usr/bin/env python3
"""
Fetch publication data from Google Scholar and update publications.json.
Strategy: try scholarly first (most complete), fall back to direct HTML scrape.
Runs daily in GitHub Actions. No-ops cleanly when SCHOLAR_ID is unset.
Adapted from ABnano/abnano.github.io.
"""
import json
import os
import re
import sys
import time
from datetime import datetime, timezone

SCHOLAR_ID = os.environ.get("SCHOLAR_ID", "").strip()
SCHOLAR_URL = f"https://scholar.google.com/citations?user={SCHOLAR_ID}&hl=en&view_op=list_works&sortby=citations&pagesize=100"

# Optional: map lowercase title substrings -> badge labels shown on the site.
BADGE_MAP = {}


def assign_badges(title: str, existing_badges: list) -> list:
    if existing_badges:
        return existing_badges
    t = title.lower()
    for key, badges in BADGE_MAP.items():
        if key in t:
            return badges
    return []


def load_existing() -> dict | None:
    try:
        with open("publications.json", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def existing_badge_map(existing: dict) -> dict:
    if not existing:
        return {}
    return {p["title"].lower(): p.get("badges", []) for p in existing.get("publications", [])}


def now_utc() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# ── Strategy 1: scholarly library ──────────────────────────────────────────
def fetch_via_scholarly(badge_lookup: dict) -> dict:
    from scholarly import scholarly
    print("Trying scholarly (direct, no proxy)...", file=sys.stderr)
    author = scholarly.search_author_id(SCHOLAR_ID)
    author = scholarly.fill(author, sections=["basics", "indices", "counts", "publications"])
    print(f"  {author.get('name')} | {author.get('citedby')} citations | h={author.get('hindex')}", file=sys.stderr)

    publications = []
    for i, pub in enumerate(author.get("publications", [])):
        bib = pub.get("bib", {})
        title = bib.get("title", "")
        publications.append({
            "rank": i + 1,
            "title": title,
            "authors": bib.get("author", ""),
            "journal": bib.get("citation", "") or bib.get("venue", ""),
            "year": str(bib.get("pub_year", "")),
            "citations": pub.get("num_citations", 0),
            "url": pub.get("pub_url") or f"https://scholar.google.com/citations?user={SCHOLAR_ID}",
            "badges": assign_badges(title, badge_lookup.get(title.lower(), [])),
        })

    publications.sort(key=lambda p: p.get("citations", 0), reverse=True)
    for i, p in enumerate(publications):
        p["rank"] = i + 1

    return {
        "updated": now_utc(),
        "total_citations": author.get("citedby", 0),
        "h_index": author.get("hindex", 0),
        "i10_index": author.get("i10index", 0),
        "publications": publications,
    }


# ── Strategy 2: direct HTML scrape fallback ────────────────────────────────
def fetch_via_scrape(badge_lookup: dict) -> dict:
    import requests
    print("Falling back to direct HTML scrape...", file=sys.stderr)
    resp = requests.get(SCHOLAR_URL, headers={"User-Agent": "Mozilla/5.0"}, timeout=30)
    resp.raise_for_status()
    html = resp.text

    def stat(label_id: str) -> int:
        m = re.search(rf'{label_id}[^>]*>(\d+)<', html)
        return int(m.group(1)) if m else 0

    publications = []
    rows = re.findall(r'class="gsc_a_tr"(.*?)</tr>', html, re.S)
    for i, row in enumerate(rows):
        title_m = re.search(r'class="gsc_a_at"[^>]*>(.*?)</a>', row, re.S)
        authors_m = re.findall(r'class="gs_gray">(.*?)</div>', row, re.S)
        year_m = re.search(r'class="gsc_a_h[^"]*">(\d{4})<', row)
        cite_m = re.search(r'class="gsc_a_ac[^"]*"[^>]*>(\d+)<', row)
        link_m = re.search(r'class="gsc_a_at" href="([^"]+)"', row)
        title = re.sub(r"<[^>]+>", "", title_m.group(1)).strip() if title_m else ""
        publications.append({
            "rank": i + 1,
            "title": title,
            "authors": re.sub(r"<[^>]+>", "", authors_m[0]).strip() if authors_m else "",
            "journal": re.sub(r"<[^>]+>", "", authors_m[1]).strip() if len(authors_m) > 1 else "",
            "year": year_m.group(1) if year_m else "",
            "citations": int(cite_m.group(1)) if cite_m else 0,
            "url": f"https://scholar.google.com{link_m.group(1)}" if link_m else "",
            "badges": assign_badges(title, badge_lookup.get(title.lower(), [])),
        })

    return {
        "updated": now_utc(),
        "total_citations": stat("gsc_rsb_st1"),
        "h_index": stat("gsc_rsb_st2"),
        "i10_index": stat("gsc_rsb_st3"),
        "publications": publications,
    }


def main() -> int:
    if not SCHOLAR_ID:
        print("SCHOLAR_ID not set; leaving publications.json unchanged.", file=sys.stderr)
        return 0

    existing = load_existing()
    badge_lookup = existing_badge_map(existing or {})

    for attempt, fetch in enumerate([fetch_via_scholarly, fetch_via_scrape]):
        try:
            data = fetch(badge_lookup)
            if not data["publications"] and existing and existing.get("publications"):
                print("Fetch returned zero publications; keeping existing file.", file=sys.stderr)
                return 0
            data["updated"] += "_CACHED" if not data["publications"] else ""
            with open("publications.json", "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            print(f"Wrote {len(data['publications'])} publications.", file=sys.stderr)
            return 0
        except Exception as e:
            print(f"Strategy {attempt + 1} failed: {e}", file=sys.stderr)
            time.sleep(3)

    print("All strategies failed; leaving publications.json unchanged.", file=sys.stderr)
    return 0  # never fail the workflow on transient Scholar blocks


if __name__ == "__main__":
    sys.exit(main())
