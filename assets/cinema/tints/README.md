# Card grades (B-10)

The job cards reuse the shared painting (../fraser-2004.png) and grade it to the
job's hour with CSS only: `CARD_GRADES` in src/game/cinematic.js stacks colour
layers over the painting with a blend mode and adds a filter chain. Nothing in
this folder is made from the painting, so a new home picture needs no rebuild.

- rain.svg: rain streaks, tiled over the golf-night card (the rain grade). Drawn
  by a seeded script, no source image.
