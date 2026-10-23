#!/usr/bin/env python3
"""Scheduled V2 media optimizer: published videos and approved music only.

A backend-only service authenticated by short-lived GitHub OIDC tokens.
Downloads may be private signed URLs; never print paths, URLs, or tokens.
FFmpeg preserves each file's extension/container. Keeps originals when savings
are small, verifies duration, stream type, codec and full decode before upload.
"""
import json
import os
import pathlib
import subprocess
import tempfile
import urllib.parse
import urllib.request

ROOT = "https://qpcsruhwqhniprakpoox.supabase.co/functions/v1/traydaq-v2-video-oidc-bridge"
AUDIENCE = "traydaq-v2-media-transcode"
SUPPORTED = {
    ("traydaq-native-creator-public", "video/mp4"),
    ("traydaq-native-music-private", "audio/mpeg"),
    ("traydaq-native-music-private", "audio/mp4"),
    ("traydaq-native-music-private", "audio/wav"),
}
EXTENSIONS = {"video/mp4": ".mp4", "audio/mpeg": ".mp3",
              "audio/mp4": ".m4a", "audio/wav": ".wav"}


def request(url, *, data=None, headers=None, timeout=60):
    req = urllib.request.Request(url, data=data, headers=headers or {})
    with urllib.request.urlopen(req, timeout=timeout) as reply:
        return reply.read()


def oidc_token():
    base = os.environ["ACTIONS_ID_TOKEN_REQUEST_URL"]
    secret = os.environ["ACTIONS_ID_TOKEN_REQUEST_TOKEN"]
    delim = "&" if "?" in base else "?"
    uri = base + delim + urllib.parse.urlencode({"audience": AUDIENCE})
    return json.loads(request(uri, headers={
        "Authorization": "bearer " + secret}, timeout=25))["value"]


def auth():
    return {"Authorization": "Bearer " + oidc_token()}


def probe(path):
    return json.loads(subprocess.check_output([
        "ffprobe", "-v", "error", "-show_streams", "-show_format",
        "-of", "json", str(path)], stderr=subprocess.DEVNULL, timeout=35))


def streams(info, kind):
    return [x for x in info.get("streams", []) if x.get("codec_type") == kind]


def validate(before, after, mime):
    a = probe(before)
    b = probe(after)
    source = streams(a, "video" if mime == "video/mp4" else "audio")
    target = streams(b, "video" if mime == "video/mp4" else "audio")
    if not source or not target:
        raise ValueError("Expected media stream missing")
    old_duration = float(a["format"]["duration"])
    new_duration = float(b["format"]["duration"])
    if not old_duration or abs(old_duration - new_duration) > max(.6, old_duration * .025):
        raise ValueError("Duration changed")
    if mime == "video/mp4":
        width_a = source[0]["width"] / source[0]["height"]
        width_b = target[0]["width"] / target[0]["height"]
        if abs(width_a - width_b) > .025 or target[0]["codec_name"] != "h264":
            raise ValueError("Video codec or aspect ratio invalid")
        if streams(a, "audio") and not streams(b, "audio"):
            raise ValueError("Video audio was lost")
    else:
        expected = {"audio/mpeg": "mp3", "audio/mp4": "aac",
                    "audio/wav": "pcm_s16le"}[mime]
        if target[0].get("codec_name") != expected:
            raise ValueError("Unexpected audio codec")
        if target[0].get("channels", 0) != source[0].get("channels", 0):
            raise ValueError("Music channels changed")
    subprocess.run(["ffmpeg", "-v", "error", "-xerror", "-i", str(after),
                    "-f", "null", "-"], check=True, stdout=subprocess.DEVNULL,
                   stderr=subprocess.DEVNULL, timeout=160)


def encode(source, dest, mime):
    common = ["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error",
              "-y", "-i", str(source)]
    if mime == "video/mp4":
        args = [
            "-map", "0:v:0", "-map", "0:a?",
            "-vf", "scale=960:960:force_original_aspect_ratio=decrease:force_divisible_by=2",
            "-c:v", "libx264", "-crf", "27", "-preset", "medium",
            "-pix_fmt", "yuv420p", "-movflags", "+faststart",
            "-c:a", "aac", "-b:a", "96k", "-ar", "44100", "-sn", "-dn"
        ]
    elif mime == "audio/mpeg":
        args = ["-map", "0:a:0", "-c:a", "libmp3lame",
                "-q:a", "3", "-map_metadata", "0", "-vn"]
    elif mime == "audio/mp4":
        args = ["-map", "0:a:0", "-c:a", "aac", "-b:a", "160k",
                "-map_metadata", "0", "-vn", "-movflags", "+faststart"]
    else:
        args = ["-map", "0:a:0", "-c:a", "pcm_s16le",
                "-map_metadata", "0", "-vn"]
    subprocess.run(common + args + [str(dest)], check=True,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=330)


def main():
    jobs = json.loads(request(ROOT, headers=auth(), timeout=35)).get("items", [])
    print("Approved video/audio files eligible for automatic optimization: " + str(len(jobs)))
    optimized, unchanged = 0, 0
    for job in jobs:
        bucket, path, mime = job["bucket"], job["path"], job["mime"]
        if ((bucket, mime) not in SUPPORTED
                or not path.endswith(EXTENSIONS[mime])):
            continue
        with tempfile.TemporaryDirectory() as scratch:
            before = pathlib.Path(scratch) / ("original" + EXTENSIONS[mime])
            after = pathlib.Path(scratch) / ("optimized" + EXTENSIONS[mime])
            before.write_bytes(request(job["url"], timeout=135))
            if before.stat().st_size != job["size"]:
                raise ValueError("Media changed during download")
            encode(before, after, mime)
            validate(before, after, mime)
            if after.stat().st_size >= before.stat().st_size * .88:
                request(ROOT, data=b"", headers={
                    **auth(), "x-traydaq-media-bucket": bucket,
                    "x-traydaq-media-path": path,
                    "x-traydaq-skip-reason": "insufficient_savings"
                }, timeout=60)
                unchanged += 1
                continue
            answer = json.loads(request(ROOT, data=after.read_bytes(), headers={
                **auth(), "Content-Type": mime,
                "x-traydaq-media-bucket": bucket,
                "x-traydaq-media-path": path
            }, timeout=175))
            if answer.get("status") != "optimized":
                raise ValueError("Backend did not confirm verified replacement")
            optimized += 1
            print("Verified "+mime+" compression: "+str(answer["savedBytes"])+" bytes saved")
    print("Verified replacements: "+str(optimized)+", originals preserved unchanged: "+str(unchanged))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # No signed storage URL, JWT or media path should ever enter workflow logs.
        print("Automatic media job stopped safely: " + type(error).__name__)
        raise SystemExit(1)
