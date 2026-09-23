#!/usr/bin/env bash
set -euo pipefail

mkdir -p sample-media

ffmpeg -hide_banner -loglevel error -y \
  -f lavfi -i "testsrc2=size=1280x720:rate=24:duration=6" \
  -f lavfi -i "sine=frequency=440:sample_rate=44100:duration=6" \
  -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest sample-media/01-landscape-6s.mp4

ffmpeg -hide_banner -loglevel error -y \
  -f lavfi -i "testsrc2=size=540x960:rate=30:duration=9" \
  -f lavfi -i "sine=frequency=554:sample_rate=48000:duration=9" \
  -c:v libvpx-vp9 -b:v 900k -c:a libopus -shortest sample-media/02-portrait-9s.webm

ffmpeg -hide_banner -loglevel error -y \
  -f lavfi -i "smptebars=size=1920x800:rate=25:duration=12" \
  -f lavfi -i "sine=frequency=659:sample_rate=48000:duration=12" \
  -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest sample-media/03-widescreen-12s.mkv

printf 'Generated three copyright-free videos in sample-media/.\n'
