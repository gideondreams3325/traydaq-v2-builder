#!/usr/bin/env python3
"""Backfill JPEG link-preview frames for approved public TRAYDAQ videos.

Runs only under the existing public V2 builder's scheduled media workflow.
Authentication: independently validated, short-lived GitHub Actions OIDC.
Never modifies source MP4 files, private media, post visibility or moderation.
"""
import json
import os
import pathlib
import subprocess
import tempfile
import urllib.parse
import urllib.request

HOST = "https://qpcsruhwqhniprakpoox.supabase.co"
ROOT = HOST + "/functions/v1/firebase-public-post-preview"
BUCKET = "traydaq-native-creator-public"
AUDIENCE = "traydaq-post-frame"
API_KEY = "sb_publishable_jjFXZqPBWn4deM5AjFKnDw_YC0ZQvta"
MAX_VIDEO = 15 * 1024 * 1024
MAX_POSTER = 650000

def request(url, *, payload=None, headers=None, timeout=25):
    req = urllib.request.Request(url, data=payload, headers=headers or {})
    with urllib.request.urlopen(req, timeout=timeout) as stream:
        return stream.read()

def token():
    url = os.environ["ACTIONS_ID_TOKEN_REQUEST_URL"]
    sep = "&" if "?" in url else "?"
    url += sep + urllib.parse.urlencode({"audience": AUDIENCE})
    raw = request(url, headers={
        "Authorization": "bearer " + os.environ["ACTIONS_ID_TOKEN_REQUEST_TOKEN"]
    })
    return json.loads(raw)["value"]

def call_api(query, *, image=None):
    headers = {"Authorization": "Bearer " + token(), "apikey": API_KEY}
    if image is None:
        return json.loads(request(ROOT + query, headers=headers, timeout=30))
    return json.loads(request(ROOT + query, payload=image, headers={
        **headers, "Content-Type": "image/jpeg"
    }, timeout=35))

def valid_source(id_, url):
    import re
    if not re.fullmatch(r"[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}", id_, re.I):
        return False
    return url == HOST + "/storage/v1/object/public/" + BUCKET + "/" + id_ + "/0.mp4"

def download_limited(url, path):
    # URL must already be exact and limited to public TRAYDAQ-owned media.
    with urllib.request.urlopen(url, timeout=60) as stream, open(path, "wb") as out:
        total = 0
        while True:
            chunk = stream.read(131072)
            if not chunk:
                break
            total += len(chunk)
            if total > MAX_VIDEO:
                raise ValueError("Public movie exceeds preview limit")
            out.write(chunk)
    if total < 1024:
        raise ValueError("Empty public movie")

def extract_jpeg(video, photo):
    # No audio, no arbitrary filters, same aspect ratio, bounded dimensions.
    for second in ("0.6", "0"):
        for quality, edge in ((4, 960), (6, 760), (8, 540)):
            cmd = [
                "ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error",
                "-y", "-ss", second, "-i", str(video),
                "-map", "0:v:0", "-frames:v", "1",
                "-vf", "scale=" + str(edge) + ":" + str(edge) +
                ":force_original_aspect_ratio=decrease:force_divisible_by=2",
                "-q:v", str(quality), "-f", "image2", str(photo),
            ]
            try:
                subprocess.run(cmd, timeout=70, check=True, capture_output=True)
            except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
                continue
            if photo.exists():
                data = photo.read_bytes()
                if (1024 <= len(data) <= MAX_POSTER and
                    data.startswith(b"\xff\xd8\xff") and data.endswith(b"\xff\xd9")):
                    return data
    raise ValueError("Video poster extraction failed")

def main():
    # API returns only public approved unscheduled video IDs, not private video data.
    saved = 0
    inspected = 0
    for offset in range(0, 2040, 40):
        page = call_api("?action=pending&offset=" + str(offset))
        for item in page.get("items", []):
            id_ = item.get("id", "")
            source = item.get("url", "")
            if not valid_source(id_, source):
                continue
            inspected += 1
            try:
                with tempfile.TemporaryDirectory() as folder:
                    video = pathlib.Path(folder) / "video.mp4"
                    photo = pathlib.Path(folder) / "share-poster.jpg"
                    download_limited(source, video)
                    frame = extract_jpeg(video, photo)
                    reply = call_api("?action=poster&id=" + urllib.parse.quote(id_), image=frame)
                    if reply.get("saved") is True:
                        saved += 1
            except Exception:
                # Keep approved media unchanged if a single file cannot produce a frame.
                print("Post frame skipped due to an unavailable/unsupported public video")
        if page.get("hasMore") is not True:
            break
    print("Public share preview frames created:", saved, "; inspected:", inspected)

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        # Never print tokens or URLs in public workflow logs.
        print("Video preview task stopped safely:", type(e).__name__)
        raise SystemExit(1)
