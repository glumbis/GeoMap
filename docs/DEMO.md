# Demo

Owner: Even. How to give the Omnium demo: the story, a 3-minute pitch, what to click, and a checklist.
Anyone on the team should be able to give the demo from this file alone.
Addresses and ids come from `docs/TEST_ADDRESSES.md`. The pitch is in Norwegian because the app is; the notes are in English.

## The story in one line

Two homes, both in Bærum/Oslo, both near a bus and a school. On paper they look alike. Omnium shows in seconds that one sits in a quick-clay hazard zone and the other doesn't, and it says where every fact comes from.

## The two addresses

| Role | Address | Id | What it shows |
|---|---|---|---|
| Start: the calm case | Grevlingåsen 17, 1362 Hosle | `3201-1574-17` | Overall **75**. Naturfare 100: no quick clay, flood, rockfall, debris-slide or avalanche zone, no noise zone. One warning: høy radonaktsomhet (common around Oslo). Busiest stop within 500 m: Jegeråsen, 212 m, 161 departures a weekday. School 256 m, kindergarten 226 m. |
| Contrast: the hidden risk | Arendalsgata 22, 0463 Oslo | `0301-10223-22` | Overall **20**, held down by three serious warnings: quick-clay zone with faregrad **høy** (NVE), meget høy radonaktsomhet and road noise 65–70 dB. Also marine clay and a polluted-ground site 17 m away. Naturfare 30. Busiest stop within 500 m: Sagene, 1154 departures. |
| Backup / extra | Nedre Rælingsveg 148, 2005 Rælingen | `3224-8900-148` | Two warnings: 200-year flood zone and red road noise zone. |

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
> Her er et vanlig hus på Hosle i Bærum. Samlet karakter 75. Det ligger ikke i noen kartlagt faresone for kvikkleire, flom eller skred, og ikke i støysone. Den eneste advarselen er høy aktsomhet for radon, som er vanlig rundt Oslo. Nærmeste skole er 256 meter unna, og fra Jegeråsen, 200 meter unna, går det 161 avganger på en vanlig hverdag.
**Point at the category cards, then open one data point to show its source and explanation.**
> Alt vi viser har en kilde. Og vi forklarer hva det betyr for den som bor der.

**1:30–2:15 — Kontrasten: Arendalsgata 22**
**Go back, type "Arendalsgata 22", pick it.**
> Så en leilighet på Sagene i Oslo. Like nær buss og skole. Men øverst ser du advarsler, den alvorligste først: eiendommen ligger i en faresone for kvikkleireskred med høy faregrad, fra NVE. I tillegg veistøy på 65–70 dB og forurenset grunn registrert i nærheten.
**Point at the warnings and the low Naturfare score.** (Once Erik adds the quick-clay layer to the map, also point at the zone around the pin.)
**Point at the score and the warnings listed under it.**
> Samlet karakter faller fra 75 til 20, og naturfare fra 100 til 30. Og siden sier hvorfor: kvikkleiren, radon og støy holder karakteren nede. Den alvorligste risikoen står alltid først, og den kan ikke gjemmes i et snitt.

**2:15–2:40 — Ærlighet om data**
**Point at a data point shown as "Ikke tilgjengelig".**
> Når vi mangler data, sier vi det. Vi gjetter aldri, og vi gir ikke en samlet karakter hvis viktige data mangler. Det er derfor du kan stole på det som står der.

**2:40–3:00 — Avslutning**
> Omnium bruker bare åpne, offentlige data, og dekker i dag Oslo og Akershus. Neste steg er hele Norge. Én adresse, alt du trenger å vite, på sekunder.

If the AI summary works on the day, show it on the Arendalsgata page at 1:30 and say: *"Et kort sammendrag skrevet av AI, bare fra faktaene vi har, og merket som AI-generert."*

## Ready for the demo?

What the pitch needs, and who it depends on. Update this as things land.

| Needed for the pitch | Status 2026-11-07 (checked in the app) | Owner |
|---|---|---|
| Profile data for both addresses (quick clay, flood, noise, polluted ground, stops, schools, kindergartens, trails, SSB) | Works | Sverre, Even, Lukas |
| Start page with address search | Works. Search shows two Grevlingåsen 17: pick 1362 Hosle | Erik |
| Address page: warnings, category cards, data points with source | Works | Erik |
| "Ikke tilgjengelig" for missing data | Works (e.g. Steinsprang under Naturfare) | Erik |
| Quick-clay zone visible on the map | Not yet: data at `/api/nve_kvikkleire`, no map layer | Erik |
| Overall rating (a number) | Works: Grevlingåsen 75, Arendalsgata 20 (caps stack: high 40, medium 75, minus 10 per extra serious warning) | Lukas |
| Explanations under each data point | Main text from `docs/TEXTS.md` is in the profile. Per-outcome texts ("Når ...") not yet | Lukas |
| AI summary | Endpoint works with the key in `.env` and follows `docs/FACTS.md`. Not on the page yet | Erik |
| Map tiles | Take 3–5 seconds to appear the first time. Open both pages before presenting | — |

For the 2:15 part, open Naturfare on Grevlingåsen: Steinsprang shows "Ikke tilgjengelig".

## Checklist before presenting

**The day before**
- [ ] Pull `main` on the demo laptop and run `npm run setup` (fresh database with every dataset). Tested from a fresh clone on 2026-11-07: about 4 minutes and ~500 MB of downloads, no errors. Stop `npm run dev` first.
- [ ] Open both demo addresses and check the numbers in "The two addresses" table. Update the pitch if they changed.
- [ ] Read the AI summary for both addresses (if it works). It must mention the quick clay for Arendalsgata and invent nothing for Grevlingåsen.
- [ ] Take the screenshots (below) as a backup.
- [ ] Rehearse once with a timer. Cut words, not clicks, if it runs long.

**One hour before**
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
3. `3-data-point.png`: one data point opened, showing its source and explanation.
4. `4-arendalsgata.png`: the Arendalsgata 22 page with the quick-clay warning at the top. **Taken.**
5. `5-map.png`: the map with the quick-clay zone around Arendalsgata.
6. `6-missing.png`: a data point shown as "Ikke tilgjengelig".

Not taken yet: 3 and 6 need a click (open a card), so take them by hand. 5 needs the quick-clay map layer.
