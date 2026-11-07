# Omnium presentation film

A Norwegian, 36.5-second, 16:9 motion film. Python is the editable source; it renders
an H.264 MP4 with an original procedural soundtrack. No browser, online renderer,
paid service, or reference-video media is needed to render it.

## Run it

From the repository root (Python 3.12+):

```powershell
python -m pip install --target docs/presentation/.packages -r docs/presentation/requirements.txt
python docs/presentation/render.py --preview
python docs/presentation/render.py
```

Open `docs/presentation/index.html` to play the finished film. Outputs are in
`docs/presentation/output/` and are ignored by Git. `--width 1280` produces a
smaller review render; `--fps 60` is available. The default is 1920×1080, 30 fps.

Edit `SCENES` for timing, `PAIRS` for the two scrolling columns, and the individual
scene functions for copy and choreography. Every frame is a deterministic function
of time, so rendering and storyboard previews use exactly the same animation.
The font is Outfit (OFL license included); brand colours are read directly from
`web/src/style.css`. The ring and wordmark come from the logo in the README.

## Story

| Seconds | Message | Motion |
|---|---|---|
| 0–3 | Du ser adressen. Men ser du alt? | Word reveals, ring draw, pin/logo rotation |
| 3–6 | Omnium. Én adresse. Et større bilde. | Circular reveal into the original logo |
| 6–10 | Søk. Se. Forstå. | Search field grows into the actual app |
| 10–14.5 | Oppdag det skjulte. | Map push, enlarged real score and warning |
| 14.5–18.5 | Mer enn en tomt. | Staggered categories beside the real map |
| 18.5–22.5 | Fakta. Kilder. Forklart. | Inverted palette, actual explanation panel |
| 22.5–29.5 | For … / Til … | Paired vertical reels, short holds and fast rolls |
| 29.5–32.5 | Mange behov. Ett kart. | Category words converge on the logo ring |
| 32.5–36.5 | Se mer. Vit mer. | Full logo hold, clear geographic scope |

## Capture and reference status

- The local map was started and all five demo profile endpoints were checked.
  Their scores were 20 / 65 / 65 / 75 / 75 on 2026-11-07.
- **These are the existing screenshots in `docs/demo/`, not fresh captures.**
  The browser-control tool stopped because it could not confidently determine
  the browser URL. No alternate browser-control route was used afterward.
- The screenshots precede the new summary card and hazard-layer work. The film
  does not simulate hazard polygons or claim that visible map layers were captured.
  The summary capability is described in editorial text, not a fabricated app view.
- Fresh screenshots and a visual review of the reference remain follow-up work.
  The supplied reference was
  https://www.youtube.com/shorts/RAf6CKpVuRo ; its content could not be inspected.
  This first cut follows the user's described fast typography, transformations,
  paired rolling words, and memorable logo treatment; it does not claim to match
  specific observed shots from the reference.
- Map attribution remains visible in full screenshots; cropped map shots carry
  `© Kartverket`. Scores are illustrative results for the named demo addresses.
- No voiceover is included. The on-screen copy carries the narrative and the
  synthesized soundtrack supplies the pulse, ticks, and transition sweeps.
