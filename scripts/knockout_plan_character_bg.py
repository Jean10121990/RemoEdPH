"""Flood-fill solid edge backgrounds to transparent on plan mascot PNGs."""
from __future__ import annotations

from collections import deque

from PIL import Image


def knockout_edge_background(path: str, tol: int = 42) -> None:
    im = Image.open(path).convert("RGBA")
    w, h = im.size
    px = im.load()

    edge = []
    for x in range(w):
        edge.append(px[x, 0][:3])
        edge.append(px[x, h - 1][:3])
    for y in range(h):
        edge.append(px[0, y][:3])
        edge.append(px[w - 1, y][:3])

    ref_r = sum(c[0] for c in edge) / len(edge)
    ref_g = sum(c[1] for c in edge) / len(edge)
    ref_b = sum(c[2] for c in edge) / len(edge)

    def close(r: int, g: int, b: int) -> bool:
        return (
            abs(r - ref_r) <= tol
            and abs(g - ref_g) <= tol
            and abs(b - ref_b) <= tol
        )

    seen = [[False] * w for _ in range(h)]
    dq: deque[tuple[int, int]] = deque()

    for x in range(w):
        for y in (0, h - 1):
            c = px[x, y]
            if close(c[0], c[1], c[2]):
                dq.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            c = px[x, y]
            if close(c[0], c[1], c[2]):
                dq.append((x, y))

    while dq:
        x, y = dq.popleft()
        if x < 0 or x >= w or y < 0 or y >= h or seen[y][x]:
            continue
        c = px[x, y]
        if not close(c[0], c[1], c[2]):
            continue
        seen[y][x] = True
        r, g, b, _a = c
        px[x, y] = (r, g, b, 0)
        dq.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))

    im.save(path, optimize=True)


if __name__ == "__main__":
    base = "public/images/plan-characters"
    for name in (
        "plan-spark-robot.png",
        "plan-steady-boy.png",
        "plan-scholar-sophia.png",
        "plan-summit-sophia.png",
    ):
        knockout_edge_background(f"{base}/{name}")
        print("ok", name)
