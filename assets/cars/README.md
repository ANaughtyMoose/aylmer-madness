# Car photo skins

Drop four PNGs per car in its folder and the game builds the car from them:

```
assets/cars/ranger/   side.png  top.png  front.png  rear.png
assets/cars/saturn/   …
assets/cars/civic/    …
assets/cars/sunfire/  …
```

- `side.png` and `top.png` are required; `front.png` / `rear.png` are optional.
- Plain **white** (or transparent) background, nothing else in frame, no shadow.
- Side and top views: **nose pointing LEFT**. (If your render faces right, add a
  `skin.json` next to it containing `{"nose": "right"}`.)
- True orthographic elevations — not 3/4 views. The silhouette IS the model:
  the side view gives the height profile, the top view the plan, the front
  view the roof taper. Wheels are detected from where the tyres meet the ground.
- 2048 px wide is plenty.

Prompts to generate these with Gemini are in `GEMINI-PROMPTS.md`.
