# Original companion sprite asset

Generated with the built-in image_gen tool on 2026-09-10. No third-party character asset was
copied. Source asset: [calendar-companion.png](../../../src/assets/calendar-companion.png).
The delivered PNG is 2172 × 724 RGBA, with transparent background and four equal horizontal
cells: seated explorer, standing explorer, Bug, closed chest. CSS displays each 543 × 724 tile
at 72 × 96 px with pixelated sampling; no raster editing or external runtime service is used.
The chest lid is animated from clipped CSS layers of the same original tile.

## Generation prompt

Asset type: original pixel-art game sprite strip for a desktop contribution calendar.
Generate EXACTLY FOUR equal SQUARE cells side by side in ONE HORIZONTAL row, entire canvas
aspect ratio 4:1, ideally 1024x256. TRUE transparent RGBA background throughout, no backdrop,
no labels, no text, no grid lines, no shadows outside sprite, no border, no extra objects.
Each square cell occupies exactly one quarter of image width. All four sprites centered within
their own square with 15% padding, full uncropped silhouettes. Consistent crisp 16-bit pixel art,
visible square pixels, limited colors, NO antialiasing, no smooth painting or vector illustration.
Cell 1: small charming explorer SITTING reading folded map, dark navy winter cap and outfit,
amber ski goggles, mint teal scarf, brown small backpack and boots, facing right.
Cell 2: SAME explorer STANDING facing right holding a short wooden debugging wand slightly raised,
same cap, goggles, outfit, scarf, backpack, boots, same scale.
Cell 3: friendly small mint-green blob bug/slime with two dark square eyes and tiny antennae,
cute not scary, body fits lower central portion of the tile, smaller than explorer.
Cell 4: closed little wooden pixel treasure chest with muted gold trim, no green grass.
Sprites share the SAME foot baseline at 85% of each tile height. Explorer head around 15% from
 top of each tile; creature/chest no larger than half tile height. Every tile stays isolated.
Use clean transparent pixels suitable for CSS background-position with four equal columns.
These are production sprites, not a UI mockup. No established copyrighted characters.

The generator returned a 3:1 strip instead of the requested 4:1 canvas. The implementation uses
the measured tile aspect ratio, preserving character proportions rather than stretching the image.
