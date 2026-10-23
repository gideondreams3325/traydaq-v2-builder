#!/usr/bin/env python3
"""Backend-only TRAYDAQ V2 maintenance: transcode old PUBLIC MP4 files in place.

Authentication uses short-lived GitHub OIDC JWTs; there are NO Supabase credentials
in this repository or runner. The server verifies the exact private workflow.
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


def request(url, *, data=None, headers=None, timeout=60):
    req = urllib.request.Request(url, data=data, headers=headers or {})
    with urllib.request.urlopen(req, timeout=timeout) as reply:
        return reply.read()


def oidc_token():
    base = os.environ["ACTIONS_ID_TOKEN_REQUEST_URL"]
    request_token = os.environ["ACTIONS_ID_TOKEN_REQUEST_TOKEN"]
    divider = "&" if "?" in base else "?"
    uri = base + divider + urllib.parse.urlencode({"audience": AUDIENCE})
    data = request(uri, headers={"Authorization": "bearer " + request_token}, timeout=30)
    return json.loads(data)["value"]


def ffprobe(path):
    data = subprocess.check_output([
        "ffprobe", "-v", "error", "-show_streams", "-show_format",
        "-of", "json", str(path)
    ], stderr=subprocess.DEVNULL)
    return json.loads(data)


def video_stream(info):
    return next(x for x in info["streams"] if x.get("codec_type") == "video")


def audio_streams(info):
    return [x for x in info["streams"] if x.get("codec_type") == "audio"]


def validate(original, reduced):
    before, after = ffprobe(original), ffprobe(reduced)
    a, b = video_stream(before), video_stream(after)
    duration_before = float(before["format"]["duration"])
    duration_after = float(after["format"]["duration"])
    if duration_before <= 0 or abs(duration_before - duration_after) > max(.55, duration_before * .025):
        raise ValueError("Unexpected video duration change")
    aspect_before = a["width"] / a["height"]
    aspect_after = b["width"] / b["height"]
    if abs(aspect_before - aspect_after) > .025:
        raise ValueError("Video aspect ratio changed")
    if b.get("codec_name") != "h264" or int(b["width"]) % 2 or int(b["height"]) % 2:
        raise ValueError("MP4 video codec or frame geometry invalid")
    if len(audio_streams(before)) and not len(audio_streams(after)):
        raise ValueError("Source audio lost")
    with open(reduced, "rb") as media:
        if media.read(8)[4:] != b"ftyp":
            raise ValueError("Compressed MP4 header invalid")
    subprocess.run(["ffmpeg", "-v", "error", "-xerror", "-i", str(reduced),
                    "-f", "null", "-"], check=True, stdout=subprocess.DEVNULL,
                   stderr=subprocess.DEVNULL, timeout=150)


def main():
    token = oidc_token()
    auth = {"Authorization": "Bearer " + token}
    manifest = json.loads(request(ROOT, headers=auth, timeout=30))
    jobs = manifest.get("items", [])
    print("Eligible public videos: " + str(len(jobs)))
    for job in jobs:
        if job.get("bucket") != "traydaq-native-creator-public":
            continue
        path = job["path"]
        if not path.endswith(".mp4"):
            continue
        with tempfile.TemporaryDirectory() as temporary:
            source = pathlib.Path(temporary) / "original.mp4"
            output = pathlib.Path(temporary) / "compressed.mp4"
            source.write_bytes(request(job["url"], timeout=120))
            if source.stat().st_size != job["size"]:
                raise ValueError("Downloaded source size changed")
            subprocess.run([
                "ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error",
                "-y", "-i", str(source),
                "-map", "0:v:0", "-map", "0:a?",
                "-vf", "scale=960:960:force_original_aspect_ratio=decrease:force_divisible_by=2",
                "-c:v", "libx264", "-crf", "27", "-preset", "medium",
                "-pix_fmt", "yuv420p", "-movflags", "+faststart",
                "-c:a", "aac", "-b:a", "96k", "-ar", "44100",
                "-sn", "-dn", str(output)
            ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=300)
            validate(source, output)
            original_size, target_size = source.stat().st_size, output.stat().st_size
            if target_size >= original_size * .88:
                print("Kept existing video: encoded file is not at least 12% smaller")
                continue
            request(ROOT, data=output.read_bytes(), headers={
                **auth,
                "Content-Type": "video/mp4",
                "x-traydaq-video-path": path
            }, timeout=160)
            print("Verified video replacement saved " + str(original_size - target_size) + " bytes")
    print("Completed one-time public video media optimization")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        # Signed URLs and short-lived OIDC tokens must NEVER appear in runner logs.
        print("Media job stopped safely: " + type(exc).__name__)
        raise SystemExit(1)
