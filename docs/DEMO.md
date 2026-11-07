# Demo

Owner: Even. How to give the Omnium demo: the story, a 3-minute pitch, what to click, and a checklist.
Anyone on the team should be able to give the demo from this file alone.
Addresses and ids come from `docs/TEST_ADDRESSES.md`. The pitch is in Norwegian because the app is; the notes are in English.

## The story in one line

Two homes, both in Bærum/Oslo, both near a bus and a school. On paper they look alike. Omnium shows in seconds that one sits in a quick-clay hazard zone, says plainly where the public maps have gaps, and says where every fact comes from.

## The two addresses

| Role | Address | Id | What it shows |
|---|---|---|---|
| Start: the calm case | Grevlingåsen 17, 1362 Hosle | `3201-1574-17` | Overall **70**, **no warnings**. Two items under **"Sjekk dette"** (checks: they cost a few points but never cap): høy radonaktsomhet (−8; "30 % av Bærum har det samme") and NVE's coarse **aktsomhetsområde for kvikkleireskred** (−3; 22 % of Bærum). NGU says "Ofte marin leire". It is *not* in a quick-clay hazard zone: NVE has made no hazard-zone map for quick clay or flood here, so both show "Ikke kartlagt her" (neutral, not scored). Grunn og geologi 52 (weakest), Naturfare 92, Miljø 100. No road, rail or aircraft noise zone. Busiest stop within 500 m: Jegeråsen, 212 m, 161 departures a weekday. School 256 m, kindergarten 226 m, Kiwi Hosle 519 m. **No injury road accidents within 200 m since 2016.** No property tax on homes in Bærum. Perspectives: Bo her 74, Bygge her 70, Familie 80, Pendler 91. |
| Contrast: the hidden risk | Arendalsgata 22, 0463 Oslo | `0301-10223-22` | Overall **17**, capped by two serious warnings: quick-clay zone "Myraløkka" with faregrad **høy** (NVE) and road noise 65–70 dB. Smaller warnings: marine clay ("Svært ofte marin leire") and a polluted-ground site 17 m away. "Sjekk dette": meget høy radonaktsomhet (50 % of Oslo has the same). Naturfare 24, Grunn og geologi 25, Miljø 39. Nearest stop 31 m, kindergarten 40 m, school 146 m, Extra Bjølsen 92 m, city bike 141 m. Busiest stop within 500 m: Sagene, 1154 departures. 8 injury road accidents within 200 m since 2016 (3 with a pedestrian or cyclist); 6 000 vehicles a day on the road 18 m away. Perspectives: Bo her 19, Bygge her 16, Familie 20, **Pendler 100**. |
| Backup / extra | Nedre Rælingsveg 148, 2005 Rælingen | `3224-8900-148` | Overall 49. Two serious warnings: 200-year flood zone and red road noise zone (37 000 vehicles a day, 70 m away). Check: quick-clay awareness area. Perspectives: Bo her 48, Bygge her 54, Familie 52, Pendler 89. |

Numbers above are from the profile on 2026-11-07 (evening), after radon and awareness areas became "checks" (Lukas/glumbis) and Even's 8 new info-only data points (power lines, school bullying, price per m², traffic volume, traffic accidents, city bikes, municipal fees, property tax). The profile now has 46 data points. Check the numbers again before the demo (see checklist): they change when data or the rating changes.

## Pitch (about 3 minutes)

Times are a guide. Bold = what you click or show.

**0:00–0:30 — Problemet**
> Når du kjøper bolig, er det mye du ikke ser. Ligger huset på kvikkleire? I en flomsone? Hvor bråkete er veien? Informasjonen finnes, men den er spredt på titalls offentlige kart og tabeller hos NVE, NGU, Kartverket, SSB og andre. Få har tid til å sjekke alt.

**0:30–0:45 — Løsningen**
> Omnium samler all offentlig informasjon om en adresse på ett sted. Du skriver inn en adresse, og får svaret raskt.

**Show the start page.** One big address field.

**0:45–1:30 — Det rolige eksempelet: Grevlingåsen 17**
**Type "Grevlingåsen 17", pick the one in 1362 Hosle.** There is also a Grevlingåsen 17 in 1386 Asker: don't pick that one.
> Her er et vanlig hus på Hosle i Bærum. Samlet karakter 70, og ingen advarsler. Det ligger ikke i støysone, og det er ikke registrert en eneste trafikkulykke med personskade innen 200 meter siden 2016. Faresoner for kvikkleire har NVE ikke laget her, og det står rett ut på siden. Under "Sjekk dette" står to ting: høy aktsomhet for radon, og at NVE sitt grovere kart sier at kvikkleireskred er mulig i området. Og vi sier hvor vanlig det er: 30 prosent av Bærum har samme radonnivå. Skolen er 256 meter unna, og fra Jegeråsen går det 161 avganger på en hverdag.
**Point at "Sjekk dette" and the "30 % av Bærum" line, then at the category cards. Open one data point to show its source and explanation.**
> Alt vi viser har en kilde. Og vi forklarer hva det betyr for den som bor der.

**1:30–2:15 — Kontrasten: Arendalsgata 22**
**Go back, type "Arendalsgata 22", pick it.**
> Så ser vi en adresse på Sagene i Oslo. Enda nærmere buss og skole. Men øverst ser du advarsler, den alvorligste først: eiendommen ligger i en faresone for kvikkleireskred med høy faregrad, fra NVE. I tillegg veistøy på 65–70 dB, marin leire i grunnen og et registrert sted med mulig forurenset grunn i nærheten.
**Point at the warnings and the low Naturfare score, then at the red quick-clay zone around the pin on the map (screenshot 5).**
**Point at the score and the warnings listed under it.**
> Samlet karakter faller fra 70 til 17, og naturfare fra 92 til 24. Og siden sier hvorfor: kvikkleiren og støyen holder karakteren nede. Den alvorligste risikoen står alltid først, og den kan ikke gjemmes i et snitt.
> Og Arendalsgata er ikke alene: over 4 200 adresser i Oslo og Akershus ligger i en faresone for kvikkleireskred med høy eller middels faregrad, 433 av dem med høy faregrad.

Where the number comes from (Sverre, 2026-11-07): all 362 241 street addresses in Oslo + Akershus (Kartverket, Matrikkelen Adresse) checked against our `nve_kvikkleire` table, each address counted once under its worst faregrad: 433 høy + 3 842 middels = 4 275, about 1 in 85. Say "adresser", never "boliger" or "hus".

**Optional (the "Hva betyr dette for deg?" tabs are on the page):** on Arendalsgata, click the **Pendler** tab, then **Bo her**, and add:
> Og svaret avhenger av hvem du er. For en pendler får adressen 100. For å bo her får den 19.

**Optional, if there is time (about 20 s): Finn område.** Click **"Finn område for meg"** on the start page (or go to `/finn`). Pick **Bærum**, tick **"Ingen kjent naturfare"** and **"Rolig (lite veistøy)"**, set **Skole** to 1 km.
> Og vi kan snu spørsmålet. I stedet for å sjekke én adresse, sier du hva du vil ha: ingen kjent naturfare, rolig, skole innen en kilometer. Da viser kartet hvor i Bærum det passer.
On 2026-11-07: 155 of 445 squares in Bærum match; the best is at Rykkinn (85). The free-text box ("Rolig sted for barnefamilie med skole innen 1 km") needs `ANTHROPIC_API_KEY` and is not tested yet (`docs/KNOWN_ISSUES.md`): use the checkboxes on stage.

**2:15–2:40 — Ærlighet om data**
**Open Miljø on Grevlingåsen: "Veistøy (strategisk støykart)" shows "Ikke tilgjengelig" (screenshot 3).**
> Når vi mangler data, sier vi det. Vi gjetter aldri, og vi gir ikke en samlet karakter hvis viktige data mangler. Derfor vet du alltid hva tallene bygger på.

**2:40–3:00 — Avslutning**
> Omnium bruker bare åpne, offentlige data, og dekker i dag Oslo og Akershus. Neste steg er hele Norge. Én adresse, all offentlig informasjon, på ett sted.

The "Sammendrag" card sits under the warnings. With `ANTHROPIC_API_KEY` in `.env` it is written by AI and labelled "AI-generert"; without the key it lists the plain fact sentences from `docs/FACTS.md` (still correct, no label). If the AI version works on the day, show it on the Arendalsgata page at 1:30 and say: *"Et kort sammendrag skrevet av AI, bare fra faktaene vi har, og merket som AI-generert."*

Why "Enda nærmere buss og skole" is true: Arendalsgata has a stop 31 m and a school 146 m away, Grevlingåsen 82 m (Grevlingbakken, but only 5 departures a weekday) and 256 m. Say "buss" loosely: the busiest stop for Grevlingåsen is Jegeråsen at 212 m.

"30 prosent av Bærum": the "Sjekk dette" line says how many addresses in the municipality share the check (`areaShare`, from the `omradescore` grid). The "Bedre enn X % av adressene i Bærum" line under the score needs `npm run scores` (about 25 minutes, see checklist); without it the line is hidden, and that is fine for the pitch.

## Ready for the demo?

What the pitch needs, and who it depends on. Update this as things land.

| Needed for the pitch | Status 2026-11-07 (checked in the app) | Owner |
|---|---|---|
| Profile data for both addresses (quick clay incl. awareness areas and marine clay, flood incl. awareness areas, road/rail/aircraft noise, polluted ground, stops, schools, kindergartens, shops, pharmacies, doctors, trails, wind, grunnkrets population, SSB, plus Even's power lines, school bullying, price per m², traffic volume, traffic accidents, city bikes, municipal fees, property tax) | Works (46 data points; Grevlingåsen has 44, Arendalsgata 45) | Sverre, Even, Lukas |
| "Sjekk dette" (radon and awareness areas as checks, with "X % av kommunen har det samme") | Works | Lukas, Erik |
| "Finn område" (`/finn`): checkboxes and distances | Works (Bærum example above). Free text with AI not tested | Erik |
| "Bedre enn X % av adressene i <kommune>" under the score | Only after `npm run scores` (25 min) | Sverre, Erik |
| PDF report ("Last ned rapport") | Works, includes every data point, the wind rose and the grunnkrets/kommune comparison | Lukas, Sverre |
| Start page with address search | Works. Search shows two Grevlingåsen 17: pick 1362 Hosle | Erik |
| Address page: warnings, category cards, data points with source | Works | Erik |
| "Ikke tilgjengelig" for missing data | Works (e.g. "Veistøy (strategisk støykart)" under Miljø on Grevlingåsen) | Erik |
| Quick-clay zone visible on the map | Works: quick-clay and flood zones on the address map, on by default, with a "Kartlag" panel | Erik |
| Overall rating (a number) | Works: Grevlingåsen 70, Arendalsgata 17 (soft caps: a capped score is scaled into the cap, see `docs/PROFILE.md`) | Lukas |
| Perspective scores (Bo her, Bygge her, Familie, Pendler) | Works: "Hva betyr dette for deg?" tabs under the warnings, with "Hva trekker ned" | Erik |
| Explanations under each data point | Works: main text and the matching "Når ..." text from `docs/TEXTS.md` | Lukas |
| AI summary | Works. Rechecked with the key on 2026-11-07 afternoon (new data means new summaries): Arendalsgata names the quick-clay zone first; Grevlingåsen invents nothing, names the quick-clay awareness area, radon and marine clay, and says NVE has no hazard-zone map for quick clay or flood there. It now sits below the "Hva betyr dette for deg?" tabs. Without the key the card shows the fact sentences | Erik, Lukas |
| "Område" card | Works: shows "Kun fakta" (information only, no score) | Lukas, Erik |
| Map tiles | Take 3–5 seconds to appear the first time. Open both pages before presenting | — |

For the 2:15 part, open Miljø on Grevlingåsen: the strategic noise map shows "Ikke tilgjengelig".

Timing: the spoken text is about 330 words (about 340 with the perspective line), about 2:30 at a calm pace, which leaves about 30–40 seconds for typing and clicks. The two address parts are the tightest (Grevlingåsen is about 95 words in 45 seconds): keep talking while the page loads. If time runs short, drop the perspective line first, then the "4 200 adresser" line.

## Questions the judges may ask

Short answers in Norwegian, ready to say. Agree on the business-model answer as a team before the demo.

**Er dette råd? Hvem har ansvaret hvis noe er feil?**
> Nei, vi gir ikke råd. Vi samler det offentlige kart allerede viser, sier hvor hvert faktum kommer fra, og merker AI-teksten. Den som skal kjøpe eller bygge, må fortsatt sjekke med kommunen eller en fagperson.

**Hvor ferske er dataene?**
> Vi henter dem direkte fra NVE, NGU, Kartverket, Entur og de andre, og kan bygge databasen på nytt med én kommando. Hver kilde har sin egen oppdateringstakt, og vi viser hvilken kilde hvert tall kommer fra.

Note: there is no automatic refresh yet. Rebuilding is `npm run setup` (was about 4 minutes; the afternoon datasets add several more, see the checklist).

**Hvordan regner dere ut karakteren?**
> Hver kategori får en karakter fra datapunktene. Alvorlige advarsler setter et tak, så en kvikkleiresone kan ikke jevnes ut av at det er kort vei til bussen. Og vi viser alltid hvorfor: hvilke advarsler som holder karakteren nede.

**Stemmer det at over 4 200 adresser ligger i en kvikkleiresone?**
> Ja, vi sjekket alle 362 000 adressene i Oslo og Akershus mot NVE sine faresoner. Det er et minimum: NVE har ikke kartlagt kvikkleire overalt. Og en adresse er ikke det samme som en bolig, for én adresse kan ha mange leiligheter.

Most høy by municipality: Lillestrøm 122, Ullensaker 80, Nannestad 67, Oslo 53, Gjerdrum 48.

**Kan AI-en finne på ting?**
> AI-en får bare faktasetningene vi har laget fra dataene, og skal bare bruke dem. Vi har sjekket sammendraget for alle testadressene. Hvis AI-en ikke svarer, viser vi faktasetningene i stedet.

**Hvorfor ikke bare bruke Norgeskart eller NVE sine kart?**
> De kartene er gode, men hvert av dem viser ett tema, og de er laget for fagfolk. Omnium samler rundt tretti datasett for én adresse, forklarer hva de betyr, og sier ærlig fra når et område ikke er kartlagt.

**Hva skal til for å dekke hele Norge?**
> De fleste kildene våre er nasjonale. I dag klipper vi dem til Oslo og Akershus. For hele landet er det mest et spørsmål om mer data og en kraftigere server, ikke ny kode.

Note: the strategic noise map only exists for some cities, so it will stay "Ikke tilgjengelig" in many places.

**Hvem skal betale for dette?** (suggestion, agree as a team)
> Gratis for den som skal kjøpe bolig. Banker, forsikringsselskaper, meglere og utbyggere kan betale for et API eller en rapport om mange adresser.

**Hva koster AI-en?**
> Under én øre per adresse, og hvert sammendrag lages bare én gang.

Note: Haiku costs about $0.0005 per address (`PLAN.md`), cached in the database.

**Hva med personvern?**
> Vi viser bare offentlige data om stedet, ikke om personer. Vi viser ikke hvem som eier boligen.

**Hvorfor er ikke boligpriser med?**
> Salgspriser per bolig er ikke åpne data. De koster penger hos private leverandører. Vi viser SSB sin gjennomsnittlige kvadratmeterpris i kommunen, og hva kommunen tar i gebyrer og eiendomsskatt.

**Hva koster det å eie her?** (if asked, or to show the Område card)
> Vi viser de faste kommunale gebyrene for vann, avløp og renovasjon, og om kommunen har eiendomsskatt på bolig. I Bærum er gebyrene 13 730 kroner i året uten moms, og det er ingen eiendomsskatt. I Oslo har de eiendomsskatt, men med et bunnfradrag på 4,9 millioner.

## Checklist before presenting

**The day before**
- [ ] Pull `main` on the demo laptop and run `npm run setup` (fresh database with every dataset). Tested from a fresh clone on 2026-11-07: about 4 minutes and ~500 MB of downloads, no errors. Sverre's afternoon datasets add time (flood awareness and marine clay alone took 5.5 minutes on his PC; the full setup is not re-timed), so allow 15 minutes. Stop `npm run dev` first.
- [ ] Optional: `npm run scores` (about 25 minutes, `npm run dev` stopped) for the "Bedre enn X % av adressene" line under the score. Skip it if short on time: the pitch doesn't need it.
- [ ] Open both demo addresses and check the numbers in "The two addresses" table. Update the pitch if they changed.
- [ ] Try the Finn område example (Bærum, ingen kjent naturfare, rolig, skole 1 km) once.
- [ ] Read the AI summary for both addresses (if it works). It must mention the quick clay for Arendalsgata and invent nothing for Grevlingåsen.
- [ ] Take the screenshots (below) as a backup.
- [ ] Record the whole demo once as a screen recording (Windows: Win+Alt+R with Xbox Game Bar, or the Snipping Tool's video mode), as a second backup.
- [ ] Rehearse once with a timer. Cut words, not clicks, if it runs long.
- [ ] Read "Questions the judges may ask" aloud once.

**One hour before**
- [ ] Stop every other `npm run dev` on the laptop (old clones too). If port 5173 or 3000 is taken, the page can silently come from an old copy. Check that Vite prints `Local: http://localhost:5173/`.
- [ ] `npm run dev` running, http://localhost:5173 open in a clean browser window. Zoom so the back row can read it.
- [ ] Open each demo address once, so the data and AI summary are cached and load fast.
- [ ] Wi-Fi works (the address search and map tiles need the internet). Have a phone hotspot ready.
- [ ] Close other tabs, turn off notifications, charger plugged in.
- [ ] Screenshots and the recording open in a second window, in case the live demo fails.

**If something breaks during the demo**
- Search fails → type the id straight in the address bar: `http://localhost:5173/a/3201-1574-17` and `/a/0301-10223-22`.
- Page fails → switch to the recording or the screenshots and keep talking. Don't debug on stage.
- Data looks wrong → say "vi ser på dette", move to the next part.

## Screenshots

Saved in `docs/demo/` at 1440×900. Retake them after big changes (headless Edge works: `msedge --headless=new --window-size=1440,900 --virtual-time-budget=15000 --screenshot=<file> <url>`).

1. `1-start.png`: the start page with the empty address field. **Taken.**
2. `2-grevlingasen.png`: the Grevlingåsen 17 page, top part: score 60, the radon and quick-clay-awareness warnings, and the "Hva betyr dette for deg?" tabs. **Taken.**
3. `3-data-point.png`: the Miljø card opened on Grevlingåsen (road, rail and aircraft noise, polluted ground), with explanations, sources and one "Ikke tilgjengelig". **Taken.** It also covers 6.
4. `4-arendalsgata.png`: the Arendalsgata 22 page with the quick-clay warning at the top, score 14 and the perspective tabs. **Taken.**
5. `5-map.png`: the same page with the Kartlag panel open, so the legend explains the red quick-clay zone around the pin. **Taken.**
6. `6-missing.png`: a data point shown as "Ikke tilgjengelig". Covered by 3.

**Out of date since 2026-11-07 evening:** screenshots 2 and 4 show the old scores (60 and 14) and radon as a warning. Retake 2, 4 and 5 before the demo.

All five retaken on 2026-11-07 afternoon by Sverre (new data and scores, Erik's new start page and perspective tabs), with Edge driven by `playwright-core`, waiting 12 s per page.

Tip: headless Edge with `--virtual-time-budget` sometimes captures the map before the hazard layers load. Driving Edge over `--remote-debugging-port` and waiting about 12 seconds per page works every time. Check that the URL is the port Vite printed: if another dev server holds 5173, you get an error page instead.
