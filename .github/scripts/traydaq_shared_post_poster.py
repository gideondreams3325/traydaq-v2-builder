#!/usr/bin/env python3
"""Prepare safe JPEG share previews from approved PUBLIC TRAYDAQ video posts.

Read-only manifest + public MP4; only the dedicated OIDC-authenticated Edge
endpoint can store a JPEG, after checking publication and source ownership.
No credentials, post captions, user IDs, or private media are logged.
"""
import json
import os
import pathlib
import subprocess
import tempfile
import urllib.error
import urllib.parse
import urllib.request

BASE = "https://qpcsruhwqhniprakpoox.supabase.co/functions/v1/firebase-public-post-preview"
ORIGIN = "https://qpcsruhwqhniprakpoox.supabase.co/storage/v1/object/public/traydaq-native-creator-public/"
MAX_MP4_BYTES = 17 * 1024 * 1024
MAX_JPEG_BYTES = 650000
MAX_PAGES = 8
MAX_IMAGES = 25


def request(url, *, data=None, headers=None, timeout=35):
    request_object = urllib.request.Request(url, data=data, headers=headers or {})
    with urllib.request.urlopen(request_object, timeout=timeout) as response:
        return response.read(MAX_MP4_BYTES + 1)


def identity_token():
    base = os.environ["ACTIONS_ID_TOKEN_REQUEST_URL"]
    delim = "&" if "?" in base else "?"
    url = base + delim + urllib.parse.urlencode({"audience": "traydaq-post-frame"})
    res = request(url, headers={"Authorization": "Bearer " + os.environ["ACTIONS_ID_TOKEN_REQUEST_TOKEN"]})
    return json.loads(res)["value"]


def jpeg_frame(video: pathlib.Path, destination: pathlib.Path):
    # Capture the 0.5s video frame, preserving aspect ratio without stretching.
    # The script does NOT rely on the mobile device or private repo credentials.
    for quality in [4, 7, 10]:
        command = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin",
                   "-y", "-ss", "0.5", "-i", str(video), "-an",
                   "-vf", "scale=960:960:force_original_aspect_ratio=decrease",
                   "-frames:v", "1", "-q:v", str(quality), str(destination)]
        try:
            subprocess.run(command, check=True, timeout=40,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except (subprocess.SubprocessError, OSError):
            return None
        if destination.exists():
            size = destination.stat().st_size
            if 1024 <= size <= MAX_JPEG_BYTES:
                return destination.read_bytes()
    return None


def main():
    token = identity_token()
    authorization = {"Authorization": "Bearer " + token}
    examined, saved, skipped = 0, 0, 0
    offset = 0
    for _ in range(MAX_PAGES):
        if saved >= MAX_IMAGES:
            break
        query = urllib.parse.urlencode({"action": "pending", "offset": offset})
        result = json.loads(request(BASE + "?" + query, headers=authorization))
        rows = result.get("items", [])
        if not isinstance(rows, list):
            raise ValueError("Public poster inventory response is invalid")
        for item in rows:
            if saved >= MAX_IMAGES:
                break
            post_id, source = item.get("id", ""), item.get("url", "")
            expected = ORIGIN + post_id + "/0.mp4"
            if not isinstance(post_id, str) or source != expected or not post_id:
                skipped += 1
                continue
            examined += 1
            try:
                movie = request(source, timeout=100)
                if len(movie) < 500 or len(movie) > MAX_MP4_BYTES:
                    skipped += 1
                    continue
                if movie[4:8] != b"ftyp":
                    skipped += 1
                    continue
                with tempfile.TemporaryDirectory() as temp:
                    movie_path = pathlib.Path(temp) / "video.mp4"
                    frame_path = pathlib.Path(temp) / "share-preview.jpg"
                    movie_path.write_bytes(movie)
                    picture = jpeg_frame(movie_path, frame_path)
                    if picture is None:
                        skipped += 1
                        continue
                    destination = BASE + "?" + urllib.parse.urlencode(
                        {"action": "poster", "id": post_id})
                    data = json.loads(request(destination, data=picture, headers={
                        **authorization,
                        "Content-Type": "image/jpeg",
                    }, timeout=40))
                    if data.get("saved") is True:
                        saved += 1
                    else:
                        skipped += 1
            except (ValueError, OSError, urllib.error.HTTPError,
                    urllib.error.URLError, TimeoutError):
                # Individual uploads may be changed/deleted during generation.
                skipped += 1
        offset = result.get("nextOffset", offset + 40)
        if not result.get("hasMore"):
            break
    print(f"Public video preview frames: examined={examined}, saved={saved}, skipped={skipped}")
    # Log no URLs, personal captions, image bytes or signed content.


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print("Public video preview generation safely stopped: " + type(error).__name__)
        raise SystemExit(1)
