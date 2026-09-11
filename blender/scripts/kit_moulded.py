"""
Parts shared by moulded and turned items: suction tips, diathermy pencils,
skin staplers, suture needles, swabs. An asset script that uses them names
this file on a `# kit: kit_moulded.py` line, and build.py prepends it after
kit.py and kit_shapes.py.

Coordinates are Blender's, as the instrument scripts use them (tip at the
origin, body up +Z, thickness along Y), not the app coordinates slab() and
lathe_part() take.
"""


def moulded_frame(axis):
    """The unit `axis` and two unit vectors square to it and to each other."""
    a = Vector(axis).normalized()
    reference = Vector((0.0, 0.0, 1.0)) if abs(a.z) < 0.9 else Vector((1.0, 0.0, 0.0))
    e1 = a.cross(reference).normalized()
    return a, e1, a.cross(e1).normalized()


def moulded_revolve(bm, base, axis, profile, material=0, segments=24, closed=False, uv_scale=UV_PER_METRE):
    """A turned part: `profile` lists (radius, height) points turned about
    `axis` through the point `base`.

    Unlike lathe_part() the profile may fold back on itself, so a part can be
    hollow (a tube's open mouth) or carry a lip. `closed` joins the last point
    back to the first. An end of radius 0 closes to a point; any other open
    end gets a flat cap. `material` is one index, or one per profile span.
    UVs run u along the profile, so brushed steel streaks along the part.
    """
    a, e1, e2 = moulded_frame(axis)
    base = Vector(base)
    angles = [2 * math.pi * j / segments for j in range(segments)]
    rings = []
    for r, h in profile:
        centre = base + a * h
        if r < 1e-7:
            rings.append([bm.verts.new(centre)])
        else:
            rings.append([bm.verts.new(centre + (e1 * math.cos(t) + e2 * math.sin(t)) * r) for t in angles])

    count = len(profile)
    points = list(profile) + ([profile[0]] if closed else [])
    along = [0.0]
    for (r0, h0), (r1, h1) in zip(points, points[1:]):
        along.append(along[-1] + math.hypot(r1 - r0, h1 - h0))
    # One texture scale round every ring, set by the widest, so the grain
    # does not stretch from ring to ring.
    v_step = 2 * math.pi * max(r for r, h in profile) * uv_scale / segments
    uv_layer = bm.loops.layers.uv.verify()
    per_span = isinstance(material, (list, tuple))

    for i in range(count if closed else count - 1):
        ring_a, ring_b = rings[i], rings[(i + 1) % count]
        u0, u1 = along[i] * uv_scale, along[i + 1] * uv_scale
        for j in range(segments):
            verts, uvs = [], []
            for ring, u, index in ((ring_a, u0, j), (ring_b, u1, j), (ring_b, u1, j + 1), (ring_a, u0, j + 1)):
                vert = ring[index % segments] if len(ring) > 1 else ring[0]
                if vert not in verts:  # a pole appears once: the quad becomes a triangle
                    verts.append(vert)
                    uvs.append((u, index * v_step))
            if len(verts) < 3:
                continue
            face = bm.faces.new(verts)
            face.material_index = material[i] if per_span else material
            for loop, uv in zip(face.loops, uvs):
                loop[uv_layer].uv = uv

    if not closed:
        for ring, span in ((list(reversed(rings[0])), 0), (rings[-1], count - 2)):
            if len(ring) < 3:
                continue
            face = bm.faces.new(ring)
            face.material_index = material[span] if per_span else material
            for loop in face.loops:
                co = loop.vert.co
                loop[uv_layer].uv = ((co.x + co.y) * uv_scale, (co.z + co.y) * uv_scale)


def moulded_ribs(start, end, count, valley, crest, width=0.7):
    """Profile points (radius, height) for `count` moulded rings between
    heights `start` and `end`: rounded beads standing out to `crest` from a
    core of radius `valley`, each bead `width` of the pitch wide. For
    moulded_revolve(). The last point is the core at `end`."""
    pitch = (end - start) / count
    fractions = (0.0, 0.5 - width / 2, 0.5 - 0.3 * width, 0.5, 0.5 + 0.3 * width, 0.5 + width / 2)
    points = []
    for n in range(count):
        for f in fractions:
            d = abs(f - 0.5) / (width / 2)
            # A half-ellipse bead: steep sides, a rounded crown.
            points.append((valley + (crest - valley) * math.sqrt(max(0.0, 1 - d * d)), start + (n + f) * pitch))
    points.append((valley, end))
    return points


def moulded_triangle(count, rounding=0.04):
    """Closed section: an equilateral triangle of circumradius 1 with a
    corner on +x, sampled at the same angles as superellipse(count), so the
    two can be blended point for point. `count` should be a multiple of 3,
    so every corner is sampled; `rounding` takes that much off each corner."""
    points = []
    for i in range(count):
        angle = 2 * math.pi * i / count
        # Distance to the nearest edge line, whose normal is 60 degrees
        # either side of each corner; the inradius is half the circumradius.
        offset = (angle % (2 * math.pi / 3)) - math.pi / 3
        r = min(0.5 / math.cos(offset), 1.0 - rounding)
        points.append((r * math.cos(angle), r * math.sin(angle)))
    return points


def moulded_blend(a, b, t):
    """Section `a` moved fraction `t` of the way to section `b`, point by point."""
    return [(ax + (bx - ax) * t, ay + (by - ay) * t) for (ax, ay), (bx, by) in zip(a, b)]


def moulded_smoothstep(x, lo, hi):
    """0 below `lo`, 1 above `hi`, easing smoothly between."""
    d = min(max((x - lo) / (hi - lo), 0.0), 1.0)
    return d * d * (3 - 2 * d)


def moulded_round(d, radius, least=0.0):
    """Scale for a section `d` in from the end of a part, rounding the last
    `radius` on a quarter circle; `least` is the scale right at the end."""
    k = min(max(d / radius, 0.0), 1.0)
    return least + (1 - least) * math.sqrt(max(0.0, 1 - (1 - k) ** 2))


def moulded_sheet(bm, xs, zs, front, back, material=0, uv_scale=UV_PER_METRE):
    """A closed thin sheet over the grid `xs` by `zs` in the XZ plane: the
    front face at y = front[i][j], the back at y = back[i][j]. The rim is one
    ring of vertices both faces share, taken from `front`, so give the two
    the same values on the rim: a pillow edge rather than a cut one. For
    cloth, pass a small `uv_scale`."""
    nx, nz = len(xs), len(zs)
    rim = [[i in (0, nx - 1) or j in (0, nz - 1) for j in range(nz)] for i in range(nx)]
    front_verts = [[bm.verts.new((xs[i], front[i][j], zs[j])) for j in range(nz)] for i in range(nx)]
    back_verts = [
        [front_verts[i][j] if rim[i][j] else bm.verts.new((xs[i], back[i][j], zs[j])) for j in range(nz)]
        for i in range(nx)
    ]
    uv_layer = bm.loops.layers.uv.verify()
    for grid, flip in ((front_verts, False), (back_verts, True)):
        for i in range(nx - 1):
            for j in range(nz - 1):
                corners = [(i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1)]
                if flip:
                    corners.reverse()
                face = bm.faces.new([grid[ci][cj] for ci, cj in corners])
                face.material_index = material
                for loop, (ci, cj) in zip(face.loops, corners):
                    loop[uv_layer].uv = (xs[ci] * uv_scale, zs[cj] * uv_scale)


def moulded_seat(bm):
    """Lift everything so its lowest point sits at z = 0, and return the lift.
    For a tip that ends on a slant, whose lowest point is a rim edge rather
    than a point on its axis."""
    lift = -min(v.co.z for v in bm.verts)
    bmesh.ops.translate(bm, vec=Vector((0.0, 0.0, lift)), verts=list(bm.verts))
    return lift
