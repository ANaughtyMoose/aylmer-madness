#!/usr/bin/env python3
"""NAD83 geographic <-> MTM zone 9 (EPSG:32189), pure stdlib.

Québec's open LiDAR tiles are named by their south-west corner in MTM 9
kilometres, so we need this to work out which tiles cover the map clip and to
put footprints into the point cloud's frame.

MTM 9: transverse Mercator, GRS80, central meridian -76°30', k0 = 0.9999,
false easting 304 800 m, false northing 0.
"""
import math

A = 6378137.0                 # GRS80 semi-major
F = 1 / 298.257222101         # GRS80 flattening
E2 = F * (2 - F)
EP2 = E2 / (1 - E2)

LON0 = math.radians(-76.5)
K0 = 0.9999
FE = 304800.0
FN = 0.0


def _M(phi):
    """Meridional arc."""
    e2, e4, e6 = E2, E2 * E2, E2 ** 3
    return A * ((1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256) * phi
                - (3 * e2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024) * math.sin(2 * phi)
                + (15 * e4 / 256 + 45 * e6 / 1024) * math.sin(4 * phi)
                - (35 * e6 / 3072) * math.sin(6 * phi))


def to_mtm9(lat, lon):
    """(lat, lon) degrees -> (easting, northing) metres in EPSG:32189."""
    phi = math.radians(lat)
    dl = math.radians(lon) - LON0
    s, c, t = math.sin(phi), math.cos(phi), math.tan(phi)
    N = A / math.sqrt(1 - E2 * s * s)
    T = t * t
    C = EP2 * c * c
    Ax = dl * c
    M = _M(phi)
    x = K0 * N * (Ax + (1 - T + C) * Ax ** 3 / 6
                  + (5 - 18 * T + T * T + 72 * C - 58 * EP2) * Ax ** 5 / 120) + FE
    y = K0 * (M + N * t * (Ax * Ax / 2 + (5 - T + 9 * C + 4 * C * C) * Ax ** 4 / 24
                           + (61 - 58 * T + T * T + 600 * C - 330 * EP2) * Ax ** 6 / 720)) + FN
    return x, y


def from_mtm9(x, y):
    """(easting, northing) EPSG:32189 -> (lat, lon) degrees."""
    x -= FE
    y -= FN
    e1 = (1 - math.sqrt(1 - E2)) / (1 + math.sqrt(1 - E2))
    M = y / K0
    mu = M / (A * (1 - E2 / 4 - 3 * E2 ** 2 / 64 - 5 * E2 ** 3 / 256))
    phi1 = (mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * math.sin(2 * mu)
            + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * math.sin(4 * mu)
            + (151 * e1 ** 3 / 96) * math.sin(6 * mu)
            + (1097 * e1 ** 4 / 512) * math.sin(8 * mu))
    s, c, t = math.sin(phi1), math.cos(phi1), math.tan(phi1)
    C1 = EP2 * c * c
    T1 = t * t
    N1 = A / math.sqrt(1 - E2 * s * s)
    R1 = A * (1 - E2) / (1 - E2 * s * s) ** 1.5
    D = x / (N1 * K0)
    phi = phi1 - (N1 * t / R1) * (D * D / 2
                                  - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * EP2) * D ** 4 / 24
                                  + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * EP2
                                     - 3 * C1 * C1) * D ** 6 / 720)
    lam = LON0 + (D - (1 + 2 * T1 + C1) * D ** 3 / 6
                  + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * EP2 + 24 * T1 * T1)
                  * D ** 5 / 120) / c
    return math.degrees(phi), math.degrees(lam)


if __name__ == '__main__':
    for lat, lon in [(45.394, -75.8355), (45.378, -75.868), (45.410, -75.803)]:
        x, y = to_mtm9(lat, lon)
        back = from_mtm9(x, y)
        print(f'{lat},{lon} -> MTM9 {x:.1f},{y:.1f} -> {back[0]:.6f},{back[1]:.6f}')
