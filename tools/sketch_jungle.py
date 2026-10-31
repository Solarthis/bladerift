# One-off sketch used to bootstrap the Jungle Outpost ASCII grid. The ASCII in
# packages/shared/src/maps/jungle.ts is the source of truth afterwards.
W, H = 104, 46
g = [['.'] * W for _ in range(H)]
def rect(x0, y0, x1, y1, ch='#'):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if 0 <= x < W and 0 <= y < H: g[y][x] = ch
def clear(x0, y0, x1, y1): rect(x0, y0, x1, y1, '.')
def plat(x0, x1, y): rect(x0, y, x1, y, '=')
def put(x, y, ch): g[y][x] = ch

# outer walls
rect(0, 0, 1, H - 1); rect(W - 2, 0, W - 1, H - 1)
# rolling ground
half = [40]*8 + [39]*6 + [38]*8 + [40]*10 + [42]*20
heights = half + half[::-1]
for x in range(W):
    rect(x, heights[x], x, H - 1)
# central pit with tunnel underneath
clear(44, 38, 59, 41)
rect(44, 42, 59, 45)
# underground tunnel from left hill to right hill
clear(14, 42, 34, 43); clear(69, 42, 89, 43)
rect(14, 44, 89, 45)
clear(34, 41, 36, 43); clear(67, 41, 69, 43)
# left tree fort
rect(8, 30, 20, 31); clear(12, 30, 15, 31)
rect(8, 22, 9, 29); plat(10, 19, 26)
rect(18, 18, 26, 19)
# right tree fort (mirror)
rect(W-21, 30, W-9, 31); clear(W-16, 30, W-13, 31)
rect(W-10, 22, W-9, 29); plat(W-20, W-11, 26)
rect(W-27, 18, W-19, 19)
# central tower
rect(48, 26, 55, 28)
rect(50, 29, 53, 33)
plat(40, 47, 33); plat(56, 63, 33)
plat(46, 57, 20)
rect(44, 12, 59, 13); clear(49, 12, 54, 13)
# floating ledges
plat(28, 36, 28); plat(67, 75, 28)
plat(30, 38, 36); plat(65, 73, 36)
rect(30, 14, 36, 15); rect(67, 14, 73, 15)
plat(3, 9, 16); plat(W-10, W-4, 16)
plat(22, 28, 9); plat(W-29, W-23, 9)
def settle(x, y, ch):
    # move marker to the first empty cell that has floor beneath
    if g[y][x] in '#=':
        while y > 0 and g[y][x] in '#=': y -= 1
    while y + 1 < H and g[y+1][x] not in '#=': y += 1
    g[y][x] = ch
put = settle
# spawns
for (x, y) in [(5,39),(W-6,39),(12,29),(W-13,29),(14,25),(W-15,25),(22,17),(W-23,17),(32,13),(W-33,13),
               (25,41),(W-26,41),(5,15),(W-6,15),(51,11),(48,32),(55,32),(40,38),(63,38),(52,43)]:
    put(x, y, 'P')
# pickups
put(51, 25, 'N')          # sniper on top of central tower
put(24, 43, 'G'); put(W-25, 43, 'G')
put(33, 27, 'A'); put(W-34, 27, 'A')
put(15, 25, 'M'); put(W-16, 25, 'M')
put(25, 8, 'B'); put(W-26, 8, 'B')
put(34, 35, 'H'); put(W-35, 35, 'H')
put(51, 19, 'H')
put(50, 41, 'R')
# decor markers: t tree, b bush, r rock, v vine
for x in [4, 24, 40, 63, 79, 98]:
    y = next(y for y in range(H) if g[y][x] == '#') - 1
    if g[y][x] == '.': g[y][x] = 't'
for x in [10, 30, 46, 57, 73, 93]:
    y = next(y for y in range(H) if g[y][x] == '#') - 1
    if g[y][x] == '.': g[y][x] = 'b'
rows = [''.join(r) for r in g]
print("\n".join(rows))
