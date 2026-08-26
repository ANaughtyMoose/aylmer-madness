#!/usr/bin/env python3
"""Validate assets/materials/atlas.png + atlas.json.

  * decodes the PNG with a from-scratch decoder (proves the encoder is right)
  * checks every manifest rect lands inside the image and no two overlap
  * checks tileable cells are actually seamless (edge row == wrapped bleed)
  * --preview <file> writes a downscaled RGB copy so a human can eyeball it

Usage: python3 tools/check_atlas.py [--preview /tmp/atlas_preview.png]
"""

import argparse
import json
import os
import struct
import sys
import zlib

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read_png(path):
    data = open(path, 'rb').read()
    assert data[:8] == b'\x89PNG\r\n\x1a\n', 'not a PNG'
    pos, idat, w = 8, b'', None
    while pos < len(data):
        ln = struct.unpack('>I', data[pos:pos + 4])[0]
        tag = data[pos + 4:pos + 8]
        body = data[pos + 8:pos + 8 + ln]
        crc = struct.unpack('>I', data[pos + 8 + ln:pos + 12 + ln])[0]
        assert crc == zlib.crc32(tag + body) & 0xFFFFFFFF, 'bad CRC in %s' % tag
        if tag == b'IHDR':
            w, h, depth, ctype = struct.unpack('>IIBB', body[:10])
            assert depth == 8 and ctype == 6, 'expected 8-bit RGBA'
        elif tag == b'IDAT':
            idat += body
        pos += 12 + ln
    raw = zlib.decompress(idat)
    bpp, stride = 4, w * 4
    out = np.zeros((h, stride), np.uint8)
    prev = np.zeros(stride, np.int32)
    p = 0
    for y in range(h):
        ft = raw[p]; p += 1
        line = np.frombuffer(raw, np.uint8, stride, p).astype(np.int32); p += stride
        if ft == 0:
            cur = line
        elif ft == 1:
            cur = line.copy()
            for x in range(bpp, stride):
                cur[x] = (cur[x] + cur[x - bpp]) & 0xFF
        elif ft == 2:
            cur = (line + prev) & 0xFF
        elif ft == 3:
            cur = line.copy()
            for x in range(stride):
                a = cur[x - bpp] if x >= bpp else 0
                cur[x] = (cur[x] + ((a + prev[x]) >> 1)) & 0xFF
        elif ft == 4:
            cur = line.copy()
            for x in range(stride):
                a = cur[x - bpp] if x >= bpp else 0
                c = prev[x - bpp] if x >= bpp else 0
                b = prev[x]
                pp = a + b - c
                pa, pb, pc = abs(pp - a), abs(pp - b), abs(pp - c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                cur[x] = (cur[x] + pr) & 0xFF
        else:
            raise SystemExit('bad filter %d' % ft)
        out[y] = cur.astype(np.uint8)
        prev = cur
    return out.reshape(h, w, 4)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dir', default=os.path.join(ROOT, 'assets', 'materials'))
    ap.add_argument('--preview', default=None)
    args = ap.parse_args()

    man = json.load(open(os.path.join(args.dir, 'atlas.json')))
    img = read_png(os.path.join(args.dir, 'atlas.png'))
    N = man['size']
    fails = []
    if img.shape[:2] != (N, N):
        fails.append('image is %dx%d, manifest says %d' % (img.shape[1], img.shape[0], N))
    print('decoded %dx%d RGBA, %d tiles' % (img.shape[1], img.shape[0], len(man['tiles'])))

    boxes = []
    for name, t in man['tiles'].items():
        for k in ('u0', 'v0', 'u1', 'v1', 'metres', 'tiled'):
            if k not in t:
                fails.append('%s: missing %s' % (name, k))
        x0, y0 = t['u0'] * N, t['v0'] * N
        x1, y1 = t['u1'] * N, t['v1'] * N
        if not (0 <= x0 < x1 <= N and 0 <= y0 < y1 <= N):
            fails.append('%s: rect outside the image' % name)
        for (on, ox0, oy0, ox1, oy1) in boxes:
            if x0 < ox1 and ox0 < x1 and y0 < oy1 and oy0 < y1:
                fails.append('%s overlaps %s' % (name, on))
        boxes.append((name, x0, y0, x1, y1))

    # seam check: for a tileable cell the pixel just outside the core must equal
    # the pixel from the opposite edge inside it (that is what the bleed is for).
    for name, t in man['tiles'].items():
        if not t['tiled']:
            continue
        x0, y0 = int(round(t['u0'] * N)), int(round(t['v0'] * N))
        x1, y1 = int(round(t['u1'] * N)), int(round(t['v1'] * N))
        left_in = img[y0:y1, x0, :3].astype(int)
        right_out = img[y0:y1, x1, :3].astype(int)
        top_in = img[y0, x0:x1, :3].astype(int)
        bot_out = img[y1, x0:x1, :3].astype(int)
        if np.abs(left_in - right_out).max() > 0:
            fails.append('%s: horizontal bleed does not wrap' % name)
        if np.abs(top_in - bot_out).max() > 0:
            fails.append('%s: vertical bleed does not wrap' % name)
        if img[y0:y1, x0:x1, 3].min() != 255:
            fails.append('%s: tileable cell is not fully opaque' % name)

    flat = man['tiles']['flat']
    if not (flat['u0'] * N <= 16 and flat['v0'] * N <= 16):
        fails.append("'flat' must be the first cell so UV (0,0) samples white")
    if img[0, 0, :3].min() != 255 or img[0, 0, 3] != 255:
        fails.append('UV (0,0) is not opaque white (got %s)' % img[0, 0])

    if args.preview:
        k = 4
        small = img[:(N // k) * k, :(N // k) * k, :3].reshape(N // k, k, N // k, k, 3)
        small = small.mean(axis=(1, 3)).astype(np.uint8)
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        from make_atlas import write_png
        rgba = np.dstack([small, np.full(small.shape[:2], 255, np.uint8)])
        write_png(args.preview, rgba)
        print('preview ->', args.preview)

    if fails:
        for f in fails:
            print('FAIL:', f)
        raise SystemExit(1)
    print('OK: rects fit, no overlaps, tileable cells wrap, (0,0) is white')


if __name__ == '__main__':
    main()
