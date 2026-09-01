#!/usr/bin/env python3
"""Minimal reader for the Statistics Canada 2006 Road Network File shapefile.

No GDAL, no pyshp, nothing to install: the shapefile and dBASE III formats are
both small enough to read directly, and we only need PolyLine (shape type 3)
plus fixed-width ASCII attributes.

The point of the file is period truth. It is Canadian street geometry as
surveyed for the 2006 census — two years after the game's summer of 2004 — so
it answers "did this street exist, and what was it called then", which current
OpenStreetMap cannot. Geometry quality is far worse than OSM's, so this is only
ever a differencing reference (see tools/period_diff.py).

Usage as a library:
    from rnf2006 import RNF
    rnf = RNF('data/raw/grnf000r06a_e')
    for rec in rnf.within(lat0, lon0, lat1, lon1):
        rec['pts']      # [(lon, lat), ...]
        rec['attrs']    # {'NAME': 'WELLINGTON', 'TYPE': 'ST', ...}
"""
import os, struct, sys


class DBF:
    """dBASE III reader that seeks rather than scans — the file is 210 MB."""

    def __init__(self, path):
        self.f = open(path, 'rb')
        head = self.f.read(32)
        self.count, self.header_len, self.rec_len = struct.unpack('<IHH', head[4:12])
        self.fields = []          # (name, type, offset within record, length)
        off = 1                   # byte 0 of every record is the deletion flag
        while True:
            d = self.f.read(32)
            if not d or d[0] == 0x0D:
                break
            name = d[:11].split(b'\0')[0].decode('latin-1').strip()
            ftype = chr(d[11])
            flen = d[16]
            self.fields.append((name, ftype, off, flen))
            off += flen
        self.names = [f[0] for f in self.fields]

    def record(self, i):
        self.f.seek(self.header_len + i * self.rec_len)
        raw = self.f.read(self.rec_len)
        out = {}
        for name, ftype, off, flen in self.fields:
            v = raw[off:off + flen].decode('latin-1').strip()
            out[name] = v
        return out

    def close(self):
        self.f.close()


class RNF:
    def __init__(self, base):
        self.shp = open(base + '.shp', 'rb')
        head = self.shp.read(100)
        if struct.unpack('>i', head[0:4])[0] != 9994:
            raise ValueError('not a shapefile')
        self.shape_type = struct.unpack('<i', head[32:36])[0]
        self.bbox = struct.unpack('<4d', head[36:68])
        # The .shx is a flat array of (offset, length) in 16-bit words. Reading
        # it whole costs ~15 MB and buys a direct seek to any record.
        with open(base + '.shx', 'rb') as f:
            f.seek(100)
            idx = f.read()
        self.n = len(idx) // 8
        self.offsets = struct.unpack('>%di' % (self.n * 2), idx[:self.n * 8])
        self.dbf = DBF(base + '.dbf')

    def _rec_bbox(self, i):
        """Per-record bounding box, without decoding a single point."""
        off = self.offsets[i * 2] * 2
        self.shp.seek(off + 8)                    # skip the 8-byte record header
        buf = self.shp.read(4 + 32)
        if struct.unpack('<i', buf[0:4])[0] != 3:  # null shape or wrong type
            return None
        return struct.unpack('<4d', buf[4:36])     # xmin, ymin, xmax, ymax

    def _rec_points(self, i):
        off = self.offsets[i * 2] * 2
        length = self.offsets[i * 2 + 1] * 2
        self.shp.seek(off + 8)
        buf = self.shp.read(length)
        n_pts = struct.unpack('<i', buf[40:44])[0]
        pts = struct.unpack('<%dd' % (n_pts * 2), buf[44 + 4 * struct.unpack('<i', buf[36:40])[0]:
                                                      44 + 4 * struct.unpack('<i', buf[36:40])[0] + 16 * n_pts])
        return list(zip(pts[0::2], pts[1::2]))

    def within(self, lat0, lon0, lat1, lon1):
        """Records whose bbox intersects the window. Cheap reject first.

        Streams the .shp front to back rather than seeking per record: 1.87M
        seeks defeat the OS readahead and take minutes, while one sequential
        pass over 328 MB takes seconds. Each record's own bounding box sits in
        the first 36 bytes of its content, so almost every record is rejected
        without decoding a point.
        """
        self.shp.seek(100)
        i = -1
        while True:
            hdr = self.shp.read(8)
            if len(hdr) < 8:
                return
            i += 1
            _, words = struct.unpack('>ii', hdr)
            body = self.shp.read(words * 2)
            if len(body) < 44 or struct.unpack('<i', body[0:4])[0] != 3:
                continue
            xmin, ymin, xmax, ymax = struct.unpack('<4d', body[4:36])
            if xmax < lon0 or xmin > lon1 or ymax < lat0 or ymin > lat1:
                continue
            n_parts, n_pts = struct.unpack('<2i', body[36:44])
            base = 44 + 4 * n_parts
            flat = struct.unpack('<%dd' % (n_pts * 2), body[base:base + 16 * n_pts])
            yield {'i': i, 'pts': list(zip(flat[0::2], flat[1::2])),
                   'attrs': self.dbf.record(i)}

    def close(self):
        self.shp.close()
        self.dbf.close()


if __name__ == '__main__':
    base = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        'data', 'raw', 'grnf000r06a_e')
    r = RNF(base)
    print('shape type', r.shape_type, 'records', r.n)
    print('bbox', r.bbox)
    print('dbf records', r.dbf.count, 'rec_len', r.dbf.rec_len)
    for f in r.dbf.fields:
        print('   field', f)
    print('--- first record ---')
    print(r.dbf.record(0))
    print(r._rec_points(0)[:4])
