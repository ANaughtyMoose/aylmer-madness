#!/usr/bin/env python3
"""Generate assets/materials/atlas.png + atlas.json — the house material atlas.

Everything here is procedural and *seeded*: running this twice produces
byte-identical output. numpy is used for the pixel maths (it is the only
non-stdlib import, and it is optional-ish: there is no Pillow anywhere in this
project, the PNG is written by hand with zlib below).

Layout (2048 x 2048):

  * 18 tileable material cells — 320 px core + 8 px of *wrapped* bleed on every
    side = 336 px pitch, 6 per row, 3 rows (y 0..1008).
  * 8 decal cells — 496 px core + 8 px bleed = 512 pitch, 4 per row, 2 rows
    (y 1008..2032).

The bleed matters: the shader tiles *inside* a sub-rect with fract(), so the
bilinear tap at the edge of a core region must find the wrapped continuation of
the pattern, not the neighbouring tile. 8 px of bleed keeps mip levels 0..3
correct as well (a level-3 texel averages an 8x8 block).

'flat' is deliberately the first cell, at (0,0), pure white: a vertex with the
default UV (0,0) therefore samples white, so untextured geometry sharing a
chunk mesh with textured houses keeps its vertex colour untouched.

Usage:  python3 tools/make_atlas.py [--out assets/materials]
"""

import argparse
import json
import os
import struct
import zlib

import numpy as np

SIZE = 2048

TILE_CORE, TILE_PAD = 320, 8
TILE_PITCH = TILE_CORE + 2 * TILE_PAD          # 336
TILE_PER_ROW = 6

DECAL_CORE, DECAL_PAD = 496, 8
DECAL_PITCH = DECAL_CORE + 2 * DECAL_PAD       # 512
DECAL_PER_ROW = 4

SEED = 20260825


# --------------------------------------------------------------- noise helpers

def periodic_noise(rs, n, cells):
    """Smooth value noise that wraps exactly at the tile edges."""
    g = rs.rand(cells, cells)
    t = np.arange(n) * (cells / n)
    i0 = np.floor(t).astype(np.int32)
    f = t - i0
    f = f * f * (3 - 2 * f)
    i1 = (i0 + 1) % cells
    i0 %= cells
    a = g[np.ix_(i0, i0)]
    b = g[np.ix_(i0, i1)]
    c = g[np.ix_(i1, i0)]
    d = g[np.ix_(i1, i1)]
    top = a + (b - a) * f[None, :]
    bot = c + (d - c) * f[None, :]
    return top + (bot - top) * f[:, None]


def fbm(rs, n, cells, octaves=4, gain=0.5):
    out = np.zeros((n, n))
    amp, tot = 1.0, 0.0
    for k in range(octaves):
        out += amp * periodic_noise(rs, n, cells * (2 ** k))
        tot += amp
        amp *= gain
    return out / tot


def speckle(rs, n):
    """Per-pixel white noise — trivially seamless (no filtering across edges)."""
    return rs.rand(n, n)


def tint(base, k):
    """base RGB (3,) times a scalar field (n,n) -> (n,n,3)."""
    return np.clip(np.asarray(base)[None, None, :] * k[:, :, None], 0, 1)


def grid(n):
    y = np.arange(n)[:, None].astype(np.float64)
    x = np.arange(n)[None, :].astype(np.float64)
    return y, x


def wrap_splits(rs, n, count, jitter=0.45):
    """`count` cut positions across n px that always start at 0 (so the tile
    seam falls on a joint) — used for stone / shake courses."""
    w = 1.0 + jitter * (rs.rand(count) - 0.5) * 2
    w = w / w.sum() * n
    cuts = np.concatenate([[0.0], np.cumsum(w)])
    cuts[-1] = n
    return cuts


# ------------------------------------------------------------------- materials

def make_brick(rs, n, base, mortar, courses=8, per_course=3, joint=4.0):
    y, x = grid(n)
    ch = n / courses
    bw = n / per_course
    row = np.floor(y / ch).astype(np.int32) % courses
    off = (row % 2) * (bw * 0.5)
    bxf = (x - off) / bw
    col = np.floor(bxf).astype(np.int32) % per_course

    jit = 0.86 + 0.28 * rs.rand(courses, per_course)
    warm = 0.94 + 0.12 * rs.rand(courses, per_course)
    k = jit[row, col]
    w = warm[row, col]

    # joints: a couple of pixels of mortar plus a soft bevel shadow inside them
    dy = y - row * ch
    dx = (bxf - np.floor(bxf)) * bw
    m_h = dy < joint
    m_v = dx < joint
    joint_mask = m_h | m_v

    edge = np.minimum(np.minimum(dy - joint, ch - dy), np.minimum(dx - joint, bw - dx))
    bevel = np.clip(edge / 7.0, 0.0, 1.0) * 0.14 + 0.86

    grain = 0.93 + 0.14 * speckle(rs, n) + 0.10 * (fbm(rs, n, 8, 3) - 0.5)
    body = np.asarray(base)[None, None, :] * (k * bevel * grain)[:, :, None]
    body[:, :, 0] *= w
    body[:, :, 2] *= (2.0 - w)

    mg = 0.90 + 0.16 * speckle(rs, n) + 0.12 * (fbm(rs, n, 12, 2) - 0.5)
    mort = np.asarray(mortar)[None, None, :] * mg[:, :, None]
    # mortar sits slightly recessed -> darken the top edge of each joint
    mort *= (0.86 + 0.14 * np.clip(dy / max(joint, 1.0), 0, 1))[:, :, None]

    return np.clip(np.where(joint_mask[:, :, None], mort, body), 0, 1)


def make_stone(rs, n, base, mortar, courses=6, joint=4.0):
    y, x = grid(n)
    img = np.asarray(mortar)[None, None, :] * (0.9 + 0.18 * speckle(rs, n))[:, :, None]
    rows = wrap_splits(rs, n, courses, 0.30)
    wob = (fbm(rs, n, 6, 3) - 0.5) * 6.0     # irregular edges, still periodic

    out = np.array(img)
    for r in range(courses):
        y0, y1 = rows[r], rows[r + 1]
        # 4–5 stones a course: with metres 0.9 that is ledgestone, roughly
        # 0.20 m long by 0.15 m high, which is what the north-end stone fronts
        # are actually clad in.
        cols = wrap_splits(rs, n, 4 + (r % 2), 0.55)
        for c in range(len(cols) - 1):
            x0, x1 = cols[c], cols[c + 1]
            m = ((y + wob) >= y0 + joint) & ((y + wob) < y1 - joint * 0.5) & \
                ((x + wob.T) >= x0 + joint) & ((x + wob.T) < x1 - joint * 0.5)
            k = 0.82 + 0.34 * rs.rand()
            g = 0.94 + 0.10 * speckle(rs, n) + 0.16 * (fbm(rs, n, 10, 2) - 0.5)
            stone = np.asarray(base)[None, None, :] * (k * g)[:, :, None]
            # a touch of vertical shading so each stone reads as a block
            sh = 0.90 + 0.12 * np.clip((y - y0) / max(y1 - y0, 1), 0, 1)
            stone = stone * sh[:, :, None]
            out = np.where(m[:, :, None], stone, out)
    return np.clip(out, 0, 1)


def make_siding(rs, n, base, laps=3, shadow=0.62, bevel=0.06, grain=0.05):
    """Horizontal lapped siding: each course is overlapped by the one above, so
    the shadow line lives at the TOP of every exposed lap."""
    y, _ = grid(n)
    lap = n / laps
    ph = (y % lap) / lap                        # 0 at the top of the lap
    k = np.ones((n, n))
    k = k * (1.0 - bevel * ph)                  # slight gradient down the lap
    s = np.clip(1.0 - ph / 0.09, 0.0, 1.0)      # shadow under the course above
    k = k * (1.0 - (1.0 - shadow) * s)
    hi = np.exp(-((ph - 0.16) / 0.06) ** 2) * 0.05
    k = k + hi
    g = fbm(rs, n, 14, 3)
    k = k * (1.0 - grain * 0.5 + grain * g) * (0.985 + 0.03 * speckle(rs, n))
    return tint(base, k)


def make_clapboard(rs, n, base, laps=4):
    y, x = grid(n)
    lap = n / laps
    ph = (y % lap) / lap
    k = 1.0 - 0.10 * ph
    k = k * (1.0 - 0.42 * np.clip(1.0 - ph / 0.07, 0.0, 1.0))
    k = k + 0.05 * np.exp(-((ph - 0.9) / 0.05) ** 2)      # lit bottom edge
    # long horizontal wood grain + the odd butt joint
    g = periodic_noise(rs, n, 3) * 0.5 + periodic_noise(rs, n, 24) * 0.5
    k = k * (0.955 + 0.09 * g)
    joints = rs.rand(laps) * n
    for i in range(laps):
        jx = joints[i]
        m = (np.abs(((x - jx + n / 2) % n) - n / 2) < 1.6) & \
            (np.floor(y / lap).astype(np.int32) % laps == i)
        k = np.where(m, k * 0.80, k)
    k = k * (0.99 + 0.02 * speckle(rs, n))
    return tint(base, k)


def make_stucco(rs, n, base):
    coarse = fbm(rs, n, 5, 4)
    fine = fbm(rs, n, 26, 2)
    k = 0.90 + 0.13 * coarse + 0.10 * (fine - 0.5) + 0.05 * (speckle(rs, n) - 0.5)
    return tint(base, k)


def make_shingle(rs, n, base, courses=5, tabs=3, notch=5.0):
    y, x = grid(n)
    ch = n / courses
    tw = n / tabs
    row = np.floor(y / ch).astype(np.int32) % courses
    off = (row % 2) * (tw * 0.5)
    txf = (x - off) / tw
    col = np.floor(txf).astype(np.int32) % tabs

    jit = 0.82 + 0.36 * rs.rand(courses, tabs)
    k = jit[row, col]

    ph = (y - row * ch) / ch
    k = k * (1.0 - 0.55 * np.clip(1.0 - ph / 0.10, 0.0, 1.0))    # course shadow
    k = k * (1.0 - 0.10 * ph)

    dx = (txf - np.floor(txf)) * tw
    in_notch = (dx < notch) & (ph > 0.28)
    k = np.where(in_notch, k * 0.42, k)

    # asphalt granules
    k = k * (0.86 + 0.28 * speckle(rs, n)) * (0.94 + 0.14 * fbm(rs, n, 20, 3))
    patch = fbm(rs, n, 6, 2)
    k = k * (0.94 + 0.13 * patch)
    return tint(base, k)


def make_cedar(rs, n, base, courses=4):
    y, x = grid(n)
    out = np.zeros((n, n, 3))
    rows = wrap_splits(rs, n, courses, 0.18)
    grain = periodic_noise(rs, n, 60) * 0.6 + periodic_noise(rs, n, 160) * 0.4
    for r in range(courses):
        y0, y1 = rows[r], rows[r + 1]
        cols = wrap_splits(rs, n, 7 + (r % 2), 0.6)
        band = (y >= y0) & (y < y1)
        ph = np.clip((y - y0) / max(y1 - y0, 1), 0, 1)
        for c in range(len(cols) - 1):
            x0, x1 = cols[c], cols[c + 1]
            m = band & (x >= x0) & (x < x1)
            k = (0.78 + 0.42 * rs.rand()) * np.ones((n, n))
            k = k * (1.0 - 0.50 * np.clip(1.0 - ph / 0.09, 0.0, 1.0))   # course shadow
            k = k * (1.0 - 0.09 * ph)
            k = k * (0.90 + 0.18 * grain)
            edge = np.minimum(x - x0, x1 - x)
            k = k * (0.62 + 0.38 * np.clip(edge / 3.0, 0, 1))           # split gap
            k = k * (0.98 + 0.04 * speckle(rs, n))
            out = np.where(m[:, :, None], tint(base, k), out)
    return np.clip(out, 0, 1)


def make_flat(rs, n):
    return np.ones((n, n, 3))


# ---------------------------------------------------------------------- decals
# Decals carry alpha: everything outside the object is alpha 0 (the shader
# discards below 0.35). Transparent pixels still get a light RGB so mip
# filtering never drags a dark fringe into the silhouette.

class Canvas:
    def __init__(self, n, bg=(0.86, 0.86, 0.85)):
        self.n = n
        self.rgb = np.zeros((n, n, 3)) + np.asarray(bg)[None, None, :]
        self.a = np.zeros((n, n))

    def rect(self, x0, y0, x1, y1, col, alpha=1.0):
        n = self.n
        a, b = int(round(y0 * n)), int(round(y1 * n))
        c, d = int(round(x0 * n)), int(round(x1 * n))
        a, b = max(0, a), min(n, b)
        c, d = max(0, c), min(n, d)
        if b <= a or d <= c:
            return
        self.rgb[a:b, c:d] = np.asarray(col)[None, None, :]
        self.a[a:b, c:d] = alpha

    def shade(self, x0, y0, x1, y1, k):
        n = self.n
        a, b = max(0, int(round(y0 * n))), min(n, int(round(y1 * n)))
        c, d = max(0, int(round(x0 * n))), min(n, int(round(x1 * n)))
        if b <= a or d <= c:
            return
        self.rgb[a:b, c:d] = np.clip(self.rgb[a:b, c:d] * k, 0, 1)

    def vgrad(self, x0, y0, x1, y1, top, bot, alpha=1.0):
        n = self.n
        a, b = max(0, int(round(y0 * n))), min(n, int(round(y1 * n)))
        c, d = max(0, int(round(x0 * n))), min(n, int(round(x1 * n)))
        if b <= a or d <= c:
            return
        t = np.linspace(0, 1, b - a)[:, None, None]
        self.rgb[a:b, c:d] = (np.asarray(top)[None, None, :] * (1 - t)
                              + np.asarray(bot)[None, None, :] * t)
        self.a[a:b, c:d] = alpha

    def disc(self, cx, cy, r, col):
        n = self.n
        yy, xx = np.mgrid[0:n, 0:n]
        m = ((xx / n - cx) ** 2 + (yy / n - cy) ** 2) < r * r
        self.rgb[m] = np.asarray(col)
        self.a[m] = 1.0

    def out(self):
        return np.clip(self.rgb, 0, 1), np.clip(self.a, 0, 1)


GLASS_TOP = (0.35, 0.42, 0.47)
GLASS_BOT = (0.20, 0.25, 0.30)
TRIM_W = (0.93, 0.93, 0.91)
TRIM_SH = (0.72, 0.72, 0.70)


def pane(cv, x0, y0, x1, y1, frame=TRIM_W, glass=(GLASS_TOP, GLASS_BOT), b=0.030):
    cv.rect(x0, y0, x1, y1, frame)
    cv.vgrad(x0 + b, y0 + b, x1 - b, y1 - b, glass[0], glass[1])
    # a soft diagonal reflection across the upper-left of the glass
    n = cv.n
    a, bb = int((y0 + b) * n), int((y1 - b) * n)
    c, d = int((x0 + b) * n), int((x1 - b) * n)
    if bb > a and d > c:
        yy, xx = np.mgrid[0:bb - a, 0:d - c]
        t = (xx / max(d - c, 1) + yy / max(bb - a, 1))
        streak = np.exp(-((t - 0.55) / 0.16) ** 2) * 0.30
        cv.rgb[a:bb, c:d] = np.clip(cv.rgb[a:bb, c:d] + streak[:, :, None], 0, 1)
    cv.shade(x0, y0, x1, y0 + b * 0.6, 0.86)


def make_window_2pane(rs, n):
    cv = Canvas(n)
    cv.rect(0.06, 0.04, 0.94, 0.96, TRIM_W)          # casing
    cv.shade(0.06, 0.04, 0.94, 0.09, 0.88)
    cv.rect(0.04, 0.90, 0.96, 0.97, TRIM_W)          # sill
    cv.shade(0.04, 0.955, 0.96, 0.97, 0.62)
    pane(cv, 0.11, 0.09, 0.89, 0.49)
    pane(cv, 0.11, 0.49, 0.89, 0.90)
    cv.rect(0.11, 0.475, 0.89, 0.515, TRIM_SH)       # meeting rail
    return cv.out()


def make_window_bay(rs, n):
    cv = Canvas(n)
    cv.rect(0.02, 0.06, 0.98, 0.94, TRIM_W)
    cv.rect(0.02, 0.88, 0.98, 0.95, TRIM_W)
    cv.shade(0.02, 0.935, 0.98, 0.95, 0.60)
    # left / centre / right, the flanks shaded as if angled away
    pane(cv, 0.05, 0.11, 0.26, 0.87)
    cv.shade(0.05, 0.11, 0.26, 0.87, 0.78)
    pane(cv, 0.29, 0.09, 0.71, 0.87)
    pane(cv, 0.74, 0.11, 0.95, 0.87)
    cv.shade(0.74, 0.11, 0.95, 0.87, 0.86)
    cv.rect(0.02, 0.06, 0.98, 0.10, TRIM_W)
    return cv.out()


def make_window_small(rs, n):
    cv = Canvas(n)
    cv.rect(0.10, 0.10, 0.90, 0.90, TRIM_W)
    cv.rect(0.08, 0.84, 0.92, 0.91, TRIM_W)
    pane(cv, 0.15, 0.15, 0.51, 0.51, b=0.035)
    pane(cv, 0.51, 0.15, 0.86, 0.51, b=0.035)
    pane(cv, 0.15, 0.51, 0.51, 0.85, b=0.035)
    pane(cv, 0.51, 0.51, 0.86, 0.85, b=0.035)
    return cv.out()


def panelled_door(rs, n, leaf, panel, knob):
    cv = Canvas(n)
    cv.rect(0.06, 0.02, 0.94, 1.00, TRIM_W)           # casing
    cv.shade(0.06, 0.02, 0.94, 0.06, 0.86)
    cv.rect(0.12, 0.06, 0.88, 1.00, leaf)             # leaf
    for (y0, y1) in ((0.11, 0.40), (0.46, 0.92)):
        for (x0, x1) in ((0.19, 0.48), (0.52, 0.81)):
            cv.rect(x0, y0, x1, y1, panel)
            cv.shade(x0, y0, x1, y0 + 0.012, 0.74)    # recess shadow
            cv.shade(x0, y0, x0 + 0.012, y1, 0.80)
            cv.shade(x0, y1 - 0.010, x1, y1, 1.12)
    cv.disc(0.81, 0.53, 0.022, knob)
    return cv.out()


def make_door_wood(rs, n):
    return panelled_door(rs, n, (0.35, 0.22, 0.14), (0.31, 0.19, 0.12), (0.72, 0.62, 0.34))


def make_door_white(rs, n):
    return panelled_door(rs, n, (0.90, 0.89, 0.86), (0.86, 0.85, 0.82), (0.62, 0.62, 0.60))


def sectional_door(rs, n, body, sections=4, windows=False):
    cv = Canvas(n)
    cv.rect(0.02, 0.02, 0.98, 1.00, (body[0] * 0.72, body[1] * 0.72, body[2] * 0.72))
    cv.rect(0.045, 0.04, 0.955, 1.00, body)
    h = (1.00 - 0.04) / sections
    for s in range(sections):
        y0 = 0.04 + s * h
        cv.shade(0.045, y0, 0.955, y0 + 0.012, 0.70)          # section joint
        cv.shade(0.045, y0 + h - 0.012, 0.955, y0 + h, 1.08)
        if windows and s == 0:
            for i in range(4):
                x0 = 0.10 + i * 0.21
                pane(cv, x0, y0 + 0.022, x0 + 0.17, y0 + h - 0.022, b=0.018)
        else:
            for i in range(3):
                x0 = 0.085 + i * 0.293
                cv.shade(x0, y0 + 0.026, x0 + 0.27, y0 + h - 0.026, 1.05)
                cv.shade(x0, y0 + 0.026, x0 + 0.27, y0 + 0.036, 0.88)
                cv.shade(x0, y0 + 0.026, x0 + 0.010, y0 + h - 0.026, 0.90)
    return cv.out()


def make_garage_door_1(rs, n):
    return sectional_door(rs, n, (0.88, 0.88, 0.86), 4, windows=False)


def make_garage_door_2(rs, n):
    return sectional_door(rs, n, (0.44, 0.33, 0.24), 4, windows=True)


def make_porch_rail(rs, n):
    cv = Canvas(n)
    white = (0.91, 0.91, 0.88)
    cv.rect(0.00, 0.06, 1.00, 0.17, white)            # top rail
    cv.shade(0.00, 0.145, 1.00, 0.17, 0.72)
    cv.rect(0.00, 0.80, 1.00, 0.89, white)            # bottom rail
    cv.shade(0.00, 0.865, 1.00, 0.89, 0.72)
    for i in range(9):
        x = 0.035 + i * 0.108
        cv.rect(x, 0.17, x + 0.040, 0.80, white)
        cv.shade(x + 0.028, 0.17, x + 0.040, 0.80, 0.80)
    cv.rect(0.00, 0.89, 0.055, 1.00, white)           # newel posts
    cv.rect(0.945, 0.89, 1.00, 1.00, white)
    cv.rect(0.00, 0.00, 0.055, 0.06, white)
    cv.rect(0.945, 0.00, 1.00, 0.06, white)
    return cv.out()


# ------------------------------------------------------------------ tile table
# metres = the size in metres of ONE repeat of the tile (square).

TILED = [
    # name,            metres, builder
    ('flat',           1.00, lambda rs, n: make_flat(rs, n)),
    ('brick_red',      0.60, lambda rs, n: make_brick(rs, n, (0.55, 0.30, 0.25), (0.72, 0.70, 0.66))),
    ('brick_brown',    0.60, lambda rs, n: make_brick(rs, n, (0.42, 0.30, 0.25), (0.66, 0.63, 0.58))),
    ('brick_buff',     0.60, lambda rs, n: make_brick(rs, n, (0.74, 0.64, 0.49), (0.77, 0.75, 0.71))),
    ('stone_grey',     0.90, lambda rs, n: make_stone(rs, n, (0.58, 0.58, 0.57), (0.70, 0.69, 0.67))),
    ('stone_beige',    0.90, lambda rs, n: make_stone(rs, n, (0.75, 0.69, 0.57), (0.78, 0.75, 0.70))),
    ('vinyl_white',    0.60, lambda rs, n: make_siding(rs, n, (0.91, 0.90, 0.87))),
    ('vinyl_beige',    0.60, lambda rs, n: make_siding(rs, n, (0.83, 0.77, 0.65))),
    ('vinyl_grey',     0.60, lambda rs, n: make_siding(rs, n, (0.62, 0.63, 0.62))),
    ('vinyl_blue',     0.60, lambda rs, n: make_siding(rs, n, (0.53, 0.60, 0.66))),
    ('vinyl_green',    0.60, lambda rs, n: make_siding(rs, n, (0.45, 0.52, 0.44))),
    ('clapboard_white', 0.60, lambda rs, n: make_clapboard(rs, n, (0.92, 0.91, 0.88))),
    ('clapboard_yellow', 0.60, lambda rs, n: make_clapboard(rs, n, (0.86, 0.79, 0.58))),
    ('stucco',         1.20, lambda rs, n: make_stucco(rs, n, (0.82, 0.79, 0.72))),
    ('shingle_dark',   0.80, lambda rs, n: make_shingle(rs, n, (0.25, 0.26, 0.27))),
    ('shingle_brown',  0.80, lambda rs, n: make_shingle(rs, n, (0.34, 0.28, 0.23))),
    ('shingle_grey',   0.80, lambda rs, n: make_shingle(rs, n, (0.45, 0.46, 0.46))),
    ('cedar',          0.80, lambda rs, n: make_cedar(rs, n, (0.53, 0.46, 0.39))),
]

# name, natural width in metres, aspect (height / width), builder
DECALS = [
    ('window_2pane',   1.20, 1.30, make_window_2pane),
    ('window_bay',     2.20, 0.70, make_window_bay),
    ('window_small',   0.70, 0.80, make_window_small),
    ('door_wood',      1.00, 2.10, make_door_wood),
    ('door_white',     1.00, 2.10, make_door_white),
    ('garage_door_1',  2.60, 0.83, make_garage_door_1),
    ('garage_door_2',  4.90, 0.44, make_garage_door_2),
    ('porch_rail',     2.40, 0.42, make_porch_rail),
]


# ----------------------------------------------------------------- png writing

def write_png(path, arr):
    """arr: uint8 (H, W, 4). Hand-rolled encoder — no Pillow in this project."""
    h, w, _ = arr.shape
    raw = np.ascontiguousarray(arr).reshape(h, w * 4)
    prev = np.zeros(w * 4, np.int16)
    lines = bytearray()
    for y in range(h):
        row = raw[y].astype(np.int16)
        sub = row.copy()
        sub[4:] -= row[:-4]
        up = row - prev
        s_sub = int(np.abs(sub.astype(np.uint8).view(np.int8)).sum())
        s_up = int(np.abs(up.astype(np.uint8).view(np.int8)).sum())
        if s_sub <= s_up:
            lines.append(1)
            lines += (sub & 0xFF).astype(np.uint8).tobytes()
        else:
            lines.append(2)
            lines += (up & 0xFF).astype(np.uint8).tobytes()
        prev = row

    def chunk(tag, data):
        return (struct.pack('>I', len(data)) + tag + data
                + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF))

    hdr = struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)
    png = (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', hdr)
           + chunk(b'IDAT', zlib.compress(bytes(lines), 9)) + chunk(b'IEND', b''))
    with open(path, 'wb') as f:
        f.write(png)
    return len(png)


# ------------------------------------------------------------------------ main

def place(atlas, alpha, x, y, core_rgb, core_a, pad, wrap):
    """Blit a core tile at (x+pad, y+pad) and surround it with `pad` px of
    bleed — wrapped continuation for tileables, edge clamp for decals."""
    n = core_rgb.shape[0]
    p = pad
    if wrap:
        big = np.take(np.take(core_rgb, np.arange(-p, n + p) % n, axis=0),
                      np.arange(-p, n + p) % n, axis=1)
        biga = np.ones((n + 2 * p, n + 2 * p))
    else:
        idx = np.clip(np.arange(-p, n + p), 0, n - 1)
        big = np.take(np.take(core_rgb, idx, axis=0), idx, axis=1)
        biga = np.take(np.take(core_a, idx, axis=0), idx, axis=1)
        # the bleed ring itself never draws
        biga[:p, :] = 0; biga[-p:, :] = 0; biga[:, :p] = 0; biga[:, -p:] = 0
    atlas[y:y + n + 2 * p, x:x + n + 2 * p] = big
    alpha[y:y + n + 2 * p, x:x + n + 2 * p] = biga


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=os.path.join(os.path.dirname(os.path.dirname(
        os.path.abspath(__file__))), 'assets', 'materials'))
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)

    rgb = np.zeros((SIZE, SIZE, 3))
    alpha = np.zeros((SIZE, SIZE))
    tiles = {}

    for i, (name, metres, fn) in enumerate(TILED):
        rs = np.random.RandomState(SEED + i * 7919)
        core = fn(rs, TILE_CORE)
        cx = (i % TILE_PER_ROW) * TILE_PITCH
        cy = (i // TILE_PER_ROW) * TILE_PITCH
        place(rgb, alpha, cx, cy, core, None, TILE_PAD, True)
        x0, y0 = cx + TILE_PAD, cy + TILE_PAD
        tiles[name] = {
            'u0': x0 / SIZE, 'v0': y0 / SIZE,
            'u1': (x0 + TILE_CORE) / SIZE, 'v1': (y0 + TILE_CORE) / SIZE,
            'metres': metres, 'tiled': True, 'aspect': 1.0,
        }

    rows_used = (len(TILED) + TILE_PER_ROW - 1) // TILE_PER_ROW
    dy0 = rows_used * TILE_PITCH
    for i, (name, metres, aspect, fn) in enumerate(DECALS):
        rs = np.random.RandomState(SEED + 100003 + i * 7919)
        core, ca = fn(rs, DECAL_CORE)
        cx = (i % DECAL_PER_ROW) * DECAL_PITCH
        cy = dy0 + (i // DECAL_PER_ROW) * DECAL_PITCH
        place(rgb, alpha, cx, cy, core, ca, DECAL_PAD, False)
        x0, y0 = cx + DECAL_PAD, cy + DECAL_PAD
        tiles[name] = {
            'u0': x0 / SIZE, 'v0': y0 / SIZE,
            'u1': (x0 + DECAL_CORE) / SIZE, 'v1': (y0 + DECAL_CORE) / SIZE,
            'metres': metres, 'tiled': False, 'aspect': aspect,
        }

    if dy0 + ((len(DECALS) + DECAL_PER_ROW - 1) // DECAL_PER_ROW) * DECAL_PITCH > SIZE:
        raise SystemExit('atlas layout overflows %d px' % SIZE)

    out = np.empty((SIZE, SIZE, 4), np.uint8)
    out[:, :, :3] = np.clip(np.rint(rgb * 255), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.rint(alpha * 255), 0, 255).astype(np.uint8)
    # empty atlas space: mid grey, fully transparent
    png_path = os.path.join(args.out, 'atlas.png')
    nbytes = write_png(png_path, out)

    manifest = {
        'size': SIZE,
        'generated_by': 'tools/make_atlas.py',
        'seed': SEED,
        'tiles': dict(sorted(tiles.items())),
    }
    with open(os.path.join(args.out, 'atlas.json'), 'w') as f:
        json.dump(manifest, f, indent=1, sort_keys=False)
        f.write('\n')
    print('atlas.png %d x %d  %.2f MB  (%d tiles)' % (SIZE, SIZE, nbytes / 1048576, len(tiles)))


if __name__ == '__main__':
    main()
