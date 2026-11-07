# Omnium — Se mer. Vit mer.

The current cut is **28 seconds, Norwegian, 1920×1080 at 60 fps**, with an original
150 BPM synthesized soundtrack. It is 8.5 seconds (23%) shorter than the first cut.
The film is rendered from Python, and can be regenerated without a browser or API.

## Run it

From the repository root, with Python 3.12+:

```powershell
python -m pip install --target docs/presentation/.packages -r docs/presentation/requirements.txt
python docs/presentation/render.py
python docs/presentation/serve.py
```

The player is at `http://127.0.0.1:5184/docs/presentation/index.html`.
`serve.py` binds only to localhost and implements byte ranges so chapter seeking
works. It serves presentation media and the two shared brand resources only.
You can also open `index.html` locally or play the MP4 directly.

Fast review commands:

```powershell
python docs/presentation/render.py --preview --width 960
python docs/presentation/render.py --width 960 --fps 24 --name review-3
```

Use `?cut=review-3` in the player to inspect a named review render. The normal URL
always loads `output/omnium-v2.mp4`. Widths must be multiples of 32. All generated
videos, audio, QA frames, and logs stay in the Git-ignored `output/` directory.
The renderer checks the entire encoded stream before replacing a finished export.

## Edit the film

- `render.py`: stable command entry point.
- `motion.py`: composition, timing, typography, reel pairs, and soundtrack.
- `WINDOW`: shared shape keyframes; the logo circle becomes the search field,
  map window, summary panel, reel highlight, and closing logo.
- `PAIRS`, `REEL_START`, `REEL_STEP`: paired users/use cases, with readable holds
  between quick vertical rolls. The audio clicks use the same timing constants.
- `player.css` / `player.js`: player layout, chapter jumps, replay, and speed.

All colours come from `web/src/style.css`; Outfit and its OFL license are bundled.
The logo mark and wordmark are taken from the original README logo. Bitmap crops
keep their aspect ratios. Motion is deterministic and render-resolution independent.

## Chapters

| Seconds | Message / action |
|---|---|
| 0–2.4 | Én adresse. Hvor mye vet du? |
| 2.4–4 | Omnium. Alt starter her. |
| 4–7.2 | Typed address; search field grows into the actual app |
| 7.2–10.4 | Se risikoen. Camera moves into the actual hazard map |
| 10.4–13.6 | Se mulighetene. School, transit, nature |
| 13.6–16.8 | Fakta. Kilder. Forklart. Actual AI summary |
| 16.8–23.2 | For / Til: seven user–use-case pairs |
| 23.2–28 | Reel frame contracts into the original logo; Se mer. Vit mer. |

## Review record

1. Reviewed the first cut: long holds, repeated full-frame slides, and small
   supporting text weakened the pace. Rebuilt around persistent geometry.
2. Rendered `review-1` at 960×540 / 15 fps. Inspected the storyboard and 24
   transition samples. Fixed clipped reel headings, accented-word baselines,
   and the detached logo during the search-field transformation.
3. Rendered `review-2` at 960×540 / 24 fps. Rechecked temporal strips. Added
   slow map zooms, removed overlapping logo instances at two handoffs, and
   preserved the selection panel under the scrolling words.
4. Rendered the final 1080p / 60 fps export. Full-stream decoding succeeds.
   Reviewed browser playback; fixed the preview server's byte-range support,
   verified chapter seeking and speed selection, and constrained the player
   to fit a laptop viewport. A static text version is available below the video.

## Capture provenance

`assets/captures/` contains fresh, unmodified browser screenshots taken from the
running map on 2026-11-07, at the browser's default 1280×720 viewport:

- `risk.png`: Arendalsgata 22, actual hazard polygons, warnings, and score 9.
- `summary.png`: the same address, scrolled to its actual AI-generated summary.
- `neighborhood.png`: Grevlingåsen 17, actual map and score 63 at capture time.

These are frozen footage assets. The live app and its rating model continue to
change; the film does not present these example scores as permanent values.
Map attribution is retained or repeated on cropped map shots. Source details
are shown inside the actual app screenshots. No hazard geometry was invented.

The supplied [YouTube reference](https://www.youtube.com/shorts/RAf6CKpVuRo) was
visually inspected in this revision: oversized typography, circular motifs,
rapid scale changes, and procedural line/dot patterns informed the motion.
No video frames, music, or other media from that reference are included.
