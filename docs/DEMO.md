# Demo

Owner: Even. How to give the Omnium demo: the story, a 3-minute pitch, what to click, and a checklist.
Anyone on the team should be able to give the demo from this file alone.
Addresses and ids come from `docs/TEST_ADDRESSES.md`. The pitch is in Norwegian because the app is; the notes are in English.

## The story in one line

Two homes, both in Bærum/Oslo, both near a bus and a school. On paper they look alike. Omnium shows in seconds that one sits in a quick-clay hazard zone, says plainly where the public maps have gaps, and says where every fact comes from.

## The two addresses

| Role | Address | Id | What it shows |
|---|---|---|---|
| Start: the calm case | Grevlingåsen 17, 1362 Hosle | `3201-1574-17` | Overall **75**. Naturfare 100: no rockfall, debris-slide, avalanche or storm-surge area, no noise zone. NVE has not mapped quick clay or flood here, so both show "Ikke kartlagt her" (neutral, not scored). One warning: høy radonaktsomhet (common around Oslo). Busiest stop within 500 m: Jegeråsen, 212 m, 161 departures a weekday. School 256 m, kindergarten 226 m. |
| Contrast: the hidden risk | Arendalsgata 22, 0463 Oslo | `0301-10223-22` | Overall **20**, held down by three serious warnings: quick-clay zone with faregrad **høy** (NVE), meget høy radonaktsomhet and road noise 65–70 dB. Also marine clay and a polluted-ground site 17 m away. Naturfare 30. Busiest stop within 500 m: Sagene, 1154 departures. |
| Backup / extra | Nedre Rælingsveg 148, 2005 Rælingen | `3224-8900-148` | Overall 65. Two warnings: 200-year flood zone and red road noise zone. |

Numbers above are from the profile on 2026-11-07. Check them again before the demo (see checklist): they change when data or the rating changes.

## Pitch (about 3 minutes)

Times are a guide. Bold = what you click or show.

**0:00–0:30 — Problemet**
> Når du kjøper bolig, er det mye du ikke ser. Ligger huset på kvikkleire? I en flomsone? Hvor bråkete er veien? Informasjonen finnes, men den er spredt på titalls offentlige kart og tabeller hos NVE, NGU, Kartverket, SSB og andre. Nesten ingen sjekker alt.

**0:30–0:45 — Løsningen**
> Omnium samler all offentlig informasjon om en adresse på ett sted. Du skriver inn en adresse, og får svaret på sekunder.

**Show the start page.** One big address field.

**0:45–1:30 — Det rolige eksempelet: Grevlingåsen 17**
**Type "Grevlingåsen 17", pick the one in 1362 Hosle.** There is also a Grevlingåsen 17 in 1386 Asker: don't pick that one.
> Her er et vanlig hus på Hosle i Bærum. Samlet karakter 75. Det ligger ikke i aktsomhetsområder for skred og ikke i støysone. Kvikkleire og flom har NVE ikke kartlagt her, og det står rett ut på siden. Den eneste advarselen er høy aktsomhet for radon, som er vanlig rundt Oslo. Nærmeste skole er 256 meter unna i luftlinje, og fra Jegeråsen, 212 meter unna, går det 161 avganger på en vanlig hverdag.
**Point at the category cards, then open one data point to show its source and explanation.**
> Alt vi viser har en kilde. Og vi forklarer hva det betyr for den som bor der.

**1:30–2:15 — Kontrasten: Arendalsgata 22**
**Go back, type "Arendalsgata 22", pick it.**
> Så ser vi en leilighet på Sagene i Oslo. Like nær buss og skole. Men øverst ser du advarsler, den alvorligste først: eiendommen ligger i en faresone for kvikkleireskred med høy faregrad, fra NVE. I tillegg veistøy på 65–70 dB og et registrert sted med mulig forurenset grunn i nærheten.
**Point at the warnings and the low Naturfare score, then at the red quick-clay zone around the pin on the map (screenshot 5).**
**Point at the score and the warnings listed under it.**
> Samlet karakter faller fra 75 til 20, og naturfare fra 100 til 30. Og siden sier hvorfor: kvikkleiren, radon og støy holder karakteren nede. Den alvorligste risikoen står alltid først, og den kan ikke gjemmes i et snitt.

**2:15–2:40 — Ærlighet om data**
**Open Miljø on Grevlingåsen: "Veistøy (strategisk støykart)" shows "Ikke tilgjengelig" (screenshot 3).**
> Når vi mangler data, sier vi det. Vi gjetter aldri, og vi gir ikke en samlet karakter hvis viktige data mangler. Derfor vet du alltid hva tallene bygger på.

**2:40–3:00 — Avslutning**
> Omnium bruker bare åpne, offentlige data, og dekker i dag Oslo og Akershus. Neste steg er hele Norge. Én adresse, all offentlig informasjon, på sekunder.

The "Sammendrag" card sits under the warnings. With `ANTHROPIC_API_KEY` in `.env` it is written by AI and labelled "AI-generert"; without the key it lists the plain fact sentences from `docs/FACTS.md` (still correct, no label). If the AI version works on the day, show it on the Arendalsgata page at 1:30 and say: *"Et kort sammendrag skrevet av AI, bare fra faktaene vi har, og merket som AI-generert."*

## Ready for the demo?

What the pitch needs, and who it depends on. Update this as things land.

| Needed for the pitch | Status 2026-11-07 (checked in the app) | Owner |
|---|---|---|
| Profile data for both addresses (quick clay, flood, noise, polluted ground, stops, schools, kindergartens, trails, SSB) | Works | Sverre, Even, Lukas |
| Start page with address search | Works. Search shows two Grevlingåsen 17: pick 1362 Hosle | Erik |
| Address page: warnings, category cards, data points with source | Works | Erik |
| "Ikke tilgjengelig" for missing data | Works (e.g. "Veistøy (strategisk støykart)" under Miljø on Grevlingåsen) | Erik |
| Quick-clay zone visible on the map | Works: quick-clay and flood zones on the address map, on by default, with a "Kartlag" panel | Erik |
| Overall rating (a number) | Works: Grevlingåsen 75, Arendalsgata 20 (caps stack: high 40, medium 75, minus 10 per extra serious warning) | Lukas |
| Explanations under each data point | Main text from `docs/TEXTS.md` is in the profile. Per-outcome texts ("Når ...") not yet | Lukas |
| AI summary | Works. Checked with the key on 2026-11-07: Arendalsgata names the quick clay first, Grevlingåsen invents nothing and says NVE has not mapped quick clay or flood there. Without the key the card shows the fact sentences | Erik, Lukas |
| Map tiles | Take 3–5 seconds to appear the first time. Open both pages before presenting | — |

For the 2:15 part, open Miljø on Grevlingåsen: the strategic noise map shows "Ikke tilgjengelig".

Timing: the spoken text is about 280 words, about 2:10 at a calm pace, which leaves about 50 seconds for typing and clicks. The two address parts are the tightest (about 80 words in 45 seconds): keep talking while the page loads.

## Checklist before presenting

**The day before**
- [ ] Pull `main` on the demo laptop and run `npm run setup` (fresh database with every dataset). Tested from a fresh clone on 2026-11-07: about 4 minutes and ~500 MB of downloads, no errors. Stop `npm run dev` first.
- [ ] Open both demo addresses and check the numbers in "The two addresses" table. Update the pitch if they changed.
- [ ] Read the AI summary for both addresses (if it works). It must mention the quick clay for Arendalsgata and invent nothing for Grevlingåsen.
- [ ] Take the screenshots (below) as a backup.
- [ ] Rehearse once with a timer. Cut words, not clicks, if it runs long.

**One hour before**
- [ ] Stop every other `npm run dev` on the laptop (old clones too). If port 5173 or 3000 is taken, the page can silently come from an old copy. Check that Vite prints `Local: http://localhost:5173/`.
- [ ] `npm run dev` running, http://localhost:5173 open in a clean browser window. Zoom so the back row can read it.
- [ ] Open each demo address once, so the data and AI summary are cached and load fast.
- [ ] Wi-Fi works (the address search and map tiles need the internet). Have a phone hotspot ready.
- [ ] Close other tabs, turn off notifications, charger plugged in.
- [ ] Screenshots open in a second window, in case the live demo fails.

**If something breaks during the demo**
- Search fails → type the id straight in the address bar: `http://localhost:5173/a/3201-1574-17` and `/a/0301-10223-22`.
- Page fails → switch to the screenshots and keep talking. Don't debug on stage.
- Data looks wrong → say "vi ser på dette", move to the next part.

## Screenshots

Saved in `docs/demo/` at 1440×900. Retake them after big changes (headless Edge works: `msedge --headless=new --window-size=1440,900 --virtual-time-budget=15000 --screenshot=<file> <url>`).

1. `1-start.png`: the start page with the empty address field. **Taken.**
2. `2-grevlingasen.png`: the Grevlingåsen 17 page, top part (no warnings, scores). **Taken.**
3. `3-data-point.png`: the Miljø card opened on Grevlingåsen, with explanations, sources and one "Ikke tilgjengelig". **Taken.** It also covers 6.
4. `4-arendalsgata.png`: the Arendalsgata 22 page with the quick-clay warning at the top. **Taken.**
5. `5-map.png`: the map with the quick-clay zone around Arendalsgata. **Taken.** Screenshots 2 and 4 were retaken at the same time, with the map layers and the summary card (fact sentences, no AI key).
6. `6-missing.png`: a data point shown as "Ikke tilgjengelig".

Not taken yet: 5 needs the quick-clay map layer.
