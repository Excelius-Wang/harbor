# Calendar traveler sprite

Generated with the built-in image tool, using the approved character comparison board as a design reference. No CLI fallback or third-party game asset was used.

Final asset: [calendar-traveler.png](../../../src/assets/calendar-traveler.png), 1448 × 1086 RGBA, alpha range 0–255. Four columns; walking, standing/greeting/rest/crouch, swing/Bug/chest poses. CSS uses explicit source-row offsets (25, 394, 758 px in 362 px units) because the generated row baselines are not an exact uniform grid. The PNG is copied without raster edits.

The first two outputs contained a painted checkerboard and were rejected. A third built-in background-removal edit produced actual transparency.

## Initial prompt

Generate a production pixel-art sprite sheet as a TRANSPARENT PNG, square canvas, EXACTLY 4 columns by 3 rows of equal square cells, 12 cells total. No text labels, no dividers, no ground, no background, genuine alpha transparency. Reference image column B is the character identity; use C's expressive motion. ORIGINAL youthful traveler: swept brown hair, amber goggles on forehead, visible face, ivory scarf, slate blue short travel coat, brown backpack and boots, wooden debugging wand. 3 heads tall, neat modern JRPG authored pixel art, crisp clustered pixels, no blur, no painterly rendering. All full body sprites SAME SCALE centered horizontally in their cell, feet SAME BASELINE 85% down cell, character fills middle 65% height, nothing crosses cell boundaries. Face right in three-quarter view in ALL hero cells. ROW 1 columns 1-4: four genuinely different consecutive RUN/WALK animation frames, alternating extended left and right legs, midpoint steps, arms and scarf follow, maintain identity and scale. ROW 2 columns 1-4: neutral standing relaxed; wave with one hand raised to goggles; seated reading folded ivory map; crouching leaning forward extending hand to open something (NO CHEST attached). ROW 3 columns 1-4: windup pose with wand raised behind body; forward swing pose with wand extended to right; small mint pixel bug creature occupying bottom third of cell; a small brown wooden closed treasure chest occupying bottom third of cell. Consistent exact 4x3 alignment and transparent padding, no duplicate miniature sprites, no UI, no extra particles. Each pixel uses limited flat palette and 3 shade clusters. Make the hero's ivory scarf/coat trim high contrast against dark UI. Do NOT copy characters from existing games. Output only sprite sheet.

## Layout correction prompt

Edit this sprite sheet. REMOVE ALL gray checkerboard pixels, replace with ACTUAL TRANSPARENT ALPHA background, output RGBA PNG. The checkerboard in the input is painted opaque and must be removed, not preserved or redrawn. Preserve the exact character designs and all 12 poses. Also fix layout for game use: LANDSCAPE canvas 4:3 aspect ratio, precisely four equal columns and three equal rows, each cell square. Each of the 12 full sprites fits inside its own cell with generous transparent margins on ALL sides, no sprite crosses into another cell. Normalize hero pose height consistently, feet baseline at 88% of each cell. First row four walk frames; second row standing/wave/seated/crouch; third row windup/swing/bug/chest. No text or cell lines, no checkerboard, no shadows, no colored background. Genuine transparency is mandatory.

## Final background-removal prompt

Remove the gray checkerboard background from this image. Return a cutout sprite sheet with transparent background (alpha channel). Preserve all character and object pixels, positions, dimensions. Use background removal / transparent output. The checkerboard is the background to remove. Do not regenerate or paint a checkerboard.
