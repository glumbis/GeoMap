# Fact-sentence rules

Owner: Even. Rules that turn an address profile into short, true Norwegian sentences: the "template step" of the AI summary (`PLAN.md` → "AI summary", code in `api/src/summary.ts`, Lukas).
The AI only rewrites these sentences, so **everything the summary may say must come from here.** If the AI is down, these sentences are shown as they are, so each one must read well on its own.

## How it works

1. For every data point in the profile, find its section below and pick the row whose **When** matches. Fill in the placeholders and keep the **Rank**.
2. Add one sentence per group of missing data points (see "Missing data").
3. Sort all sentences by **Rank** (lowest first). Inside the same rank, keep the category order of the profile.
4. Add the rating sentence last (see "Rating").

Placeholders (all from the profile, nothing else):
- `{display}`: the data point's `display` text, as it is.
- `{value}`: the data point's `value`.
- `{label}`: the data point's `label`, in lower case.
- `{src}`: the `owner` of the data point's source (e.g. NVE, SSB).

**When** uses the data point's `value` and `warning`, exactly as `read()` in `api/src/datapoints.ts` sets them today.

## Ranks

| Rank | What | Example |
|---|---|---|
| 1 | Warning with severity high | Quick clay, faregrad høy |
| 2 | Warning with severity medium | 200-year flood zone, red noise zone |
| 3 | Warning with severity low | Yellow noise zone, polluted ground nearby |
| 4 | Bad, no warning | No school within 5 km |
| 5 | Good: a hazard we checked and did not find | Not in a mapped flood zone |
| 6 | Neutral facts and good location facts | Municipality, income, nearest stop |
| 7 | Missing data | "Vi har ikke data om radon ennå." |
| 8 | Rating | Always last |

Rank 5 matters: the summary must say that we checked a hazard and found nothing, so it does not look like we forgot it. But always with "kartlagt" (mapped) or the map's limits, never "trygt" (safe).

## Sentence rules

Rules for every sentence:
- Bokmål, one sentence, ends with the source in brackets: `(NVE)`.
- Say "eiendommen" or "adressen", never "du" or "huset ditt".
- No advice, no judgement words like "farlig", "trygt", "bra" or "dårlig". Say what the data says.
- Never round a risk up or down. Use the exact level from the data (faregrad, støysone, years).
- Never add a number, place or hazard that is not in the profile.

### Ground & geology

**`soilType` (Løsmasser)**

| When | Sentence | Rank |
|---|---|---|
| warning (marin leire) | Grunnen består av {display}, som er marin leire ({src}). | 3 |
| value "Bart fjell" | Det er bart fjell eller bare et tynt lag løsmasser på stedet ({src}). | 6 |
| no warning | Grunnen består av {display} ({src}). | 6 |

Write `{display}` with a lower-case first letter inside the sentence: "Grunnen består av hav- og fjordavsetning, …", not "… av Hav- og fjordavsetning".

**`bedrock` (Berggrunn)**

| When | Sentence | Rank |
|---|---|---|
| warning (alunskifer) | Berggrunnen på stedet inneholder alunskifer ({src}). | 3 |
| no warning | Berggrunnen på stedet er {rock} ({src}). | 6 |

`{display}` is the rock type, maybe followed by " (oversiktskart)" and ", med alunskifer". `{rock}` is the rock type alone, in lower case. If it says "(oversiktskart)", add "ifølge et oversiktskart" before the source: the coarse 1:250 000 map can be wrong for a single plot. Never call alunskifer dangerous; the info text explains what it can do.

**`radon` (Radon)**

| When | Sentence | Rank |
|---|---|---|
| value "megetHøy" | Adressen ligger i et område med meget høy aktsomhet for radon ({src}). | 3 |
| value "høy" | Adressen ligger i et område med høy aktsomhet for radon ({src}). | 3 |
| value "middels" | Adressen ligger i et område med middels aktsomhet for radon ({src}). | 6 |
| value "lav" | Adressen ligger i et område med lav aktsomhet for radon ({src}). | 5 |

**`energyWell` (Nærmeste energibrønn)**

| When | Sentence | Rank |
|---|---|---|
| value is a number, `{display}` has "fjell" | Nærmeste registrerte energibrønn er {distance} unna i luftlinje, og der var det {rock} m ned til fjell ({src}). | 6 |
| value is a number, no "fjell" in `{display}` | Nærmeste registrerte energibrønn er {distance} unna i luftlinje ({src}). | 6 |
| value is empty | Det er ikke registrert noen energibrønn innen 500 m fra adressen ({src}). | 6 |

`{display}` is "59 m unna, fjell 2 m under bakken": `{distance}` is the part before " unna", `{rock}` the number before " m under bakken". Example (Grevlingåsen 17): "Nærmeste registrerte energibrønn er 59 m unna i luftlinje, og der var det 2 m ned til fjell (NGU)."
Info only. Never say the depth holds for this plot, and never turn it into advice about heat pumps.

**`marineClay` (Mulighet for marin leire)**

| When | Sentence | Rank |
|---|---|---|
| effect bad ("ofte", "noen ganger") | NGU vurderer at det er {display in lower case} i grunnen her ({src}). | 4 |
| effect good ("sjelden", "stort sett aldri") | NGU vurderer at det er {display in lower case} i grunnen her ({src}). | 6 |
| value is empty | Adressen ligger over marin grense eller utenfor NGUs kart, så NGU har ikke vurdert marin leire her ({src}). | 6 |

Example (Grevlingåsen 17): "NGU vurderer at det er ofte marin leire i grunnen her (NGU)." Never write "kvikkleire" in this sentence: marine clay is where quick clay is possible, not quick clay.

### Natural hazards

**`quickClay` (Kvikkleire faresone)**

| When | Sentence | Rank |
|---|---|---|
| warning, value "høy" | Eiendommen ligger i en faresone for kvikkleireskred med høy faregrad ({src}). | 1 |
| warning, value "middels" | Eiendommen ligger i en faresone for kvikkleireskred med middels faregrad ({src}). | 2 |
| warning, value "lav" | Eiendommen ligger i en faresone for kvikkleireskred med lav faregrad ({src}). | 3 |
| value "ingen" (zone without faregrad) | Eiendommen ligger i en kartlagt kvikkleiresone der NVE ikke har satt noen faregrad ({src}). | 6 |
| no zone | Eiendommen ligger ikke i en kartlagt faresone for kvikkleireskred ({src}). | 5 |
| value "ikkeKartlagt" (NVE has not mapped quick clay here) | NVE har ikke laget faresonekart for kvikkleireskred der eiendommen ligger, så det finnes ingen kartlagt faregrad her ({src}). | 7 |

"ingen" is neither a risk nor an all-clear: never write "faresone" or "trygt" for it, and don't add a faregrad.

"Not mapped" is a gap, not an all-clear. It gets its own sentence (not the grouped `noCoverage` sentence under "Missing data") and never merges with the rank 5 "ikke i en kartlagt faresone" sentences, so the summary can't read as "no quick clay".

**`flood200` (Flomsone)**

| When | Sentence | Rank |
|---|---|---|
| warning, value ≤ 20 | Eiendommen ligger i en flomsone som kan bli oversvømt ved en {value}-årsflom ({src}). | 1 |
| warning, other value | Eiendommen ligger i en flomsone som kan bli oversvømt ved en {value}-årsflom ({src}). | 2 |
| no warning | Eiendommen ligger ikke i en kartlagt flomsone ({src}). | 5 |
| value "ikkeKartlagt" (NVE has no flood zone map here) | NVE har ikke laget flomsonekart der eiendommen ligger, så det finnes ingen kartlagt flomsone her ({src}). | 7 |

NVE flood zone maps cover only selected rivers and towns. Like quick clay, "not mapped" gets its own sentence and never merges with the rank 5 sentences.

**`quickClayAwareness` (Aktsomhetsområde for kvikkleireskred)**

| When | Sentence | Rank |
|---|---|---|
| in an awareness area | Eiendommen ligger i et aktsomhetsområde for kvikkleireskred, et grovt kart over hvor kvikkleire kan finnes, som ikke er en kartlagt faresone ({src}). | 3 |
| value "ikkeKartlagt" | NVE har ikke vurdert aktsomhet for kvikkleireskred i området der eiendommen ligger ({src}). | 7 |
| not in one | Eiendommen ligger ikke i et aktsomhetsområde for kvikkleireskred ({src}). | 5 |

**`floodAwareness` (Aktsomhetsområde for flom)**

| When | Sentence | Rank |
|---|---|---|
| in an awareness area | Eiendommen ligger i et aktsomhetsområde for flom, et grovt kart over områder langs vassdrag som kan bli oversvømt, som ikke er en kartlagt flomsone ({src}). | 3 |
| not in one | Eiendommen ligger ikke i et aktsomhetsområde for flom ({src}). | 5 |

An awareness area and a hazard zone are different maps (coarse "possible" vs. mapped in detail), so both can hold at once. The sentences say what kind of map each is, and the AI prompt tells the model to join them logically ("i et aktsomhetsområde …, men ikke i en kartlagt faresone") and never to say data is missing about a hazard it has a finding for.

**`rockfall` (Steinsprang)**

| When | Sentence | Rank |
|---|---|---|
| warning | Eiendommen ligger i et aktsomhetsområde for steinsprang ({src}). | 2 |
| no warning | Eiendommen ligger ikke i et aktsomhetsområde for steinsprang ({src}). | 5 |

**`debrisFlow` (Jord- og flomskred)**

| When | Sentence | Rank |
|---|---|---|
| warning | Eiendommen ligger i et aktsomhetsområde for jord- og flomskred ({src}). | 2 |
| no warning | Eiendommen ligger ikke i et aktsomhetsområde for jord- og flomskred ({src}). | 5 |

**`avalanche` (Snøskred)**

| When | Sentence | Rank |
|---|---|---|
| value "medSkog" (warning medium) | Eiendommen ligger i et aktsomhetsområde for snøskred ({src}). | 2 |
| value "utenSkog" (warning low) | Eiendommen ligger i et område der snøskred bare kan nå fram hvis skogen over blir borte ({src}). | 3 |
| no warning | Eiendommen ligger ikke i et aktsomhetsområde for snøskred ({src}). | 5 |

**`stormSurge` (Stormflo)**

| When | Sentence | Rank |
|---|---|---|
| warning high (value ≤ 20) | Eiendommen ligger i et område som kan bli oversvømt fra sjøen ved en {value}-årsstormflo i dag ({src}). | 1 |
| warning medium (value 200) | Eiendommen ligger i et område som kan bli oversvømt fra sjøen ved en {value}-årsstormflo i dag ({src}). | 2 |
| value 2100 (warning low) | Eiendommen kan bli oversvømt fra sjøen ved en 200-årsstormflo med havnivået som er ventet i år 2100 ({src}). | 3 |
| no warning | Eiendommen ligger ikke i et område som kan bli oversvømt ved stormflo ifølge Kartverkets beregninger ({src}). | 5 |

Value 2100 is a year, not a return period: never write "2100-årsstormflo".

Rockfall, debris-slide and avalanche maps are *aktsomhetsområder*: coarse maps of where a slide is possible, made from a terrain model. Always write "aktsomhetsområde", never "faresone", so the summary doesn't make them sound like the mapped quick-clay or flood zones.

**`quickClayAwareness` (Aktsomhetsområde for kvikkleireskred)** and **`floodAwareness` (Aktsomhetsområde for flom)**

| When | Sentence | Rank |
|---|---|---|
| `quickClayAwareness`, value true | Adressen ligger i et aktsomhetsområde for kvikkleireskred, der grunnen bør undersøkes før det bygges eller graves ({src}). | 3 |
| `quickClayAwareness`, value false | Adressen ligger ikke i et aktsomhetsområde for kvikkleireskred i områdene NVE har vurdert ({src}). | 5 |
| `quickClayAwareness`, value "ikkeKartlagt" | NVE har ikke vurdert kvikkleireskred for dette området ennå ({src}). | 7 |
| `floodAwareness`, value true | Adressen ligger i et aktsomhetsområde for flom fra elv eller bekk ({src}). | 3 |
| `floodAwareness`, value false | Adressen ligger ikke i et aktsomhetsområde for flom fra elv eller bekk ({src}). | 5 |

Always "aktsomhetsområde", never "faresone": these are coarse maps of where something is possible. When `quickClay` or `flood200` already gives a zone sentence, still add this one: they are different maps.

### Environment

**`roadNoise` (Veistøy)**

| When | Sentence | Rank |
|---|---|---|
| value "rød" | Adressen ligger i rød støysone fra vei, med 65 dB eller mer ({src}). | 2 |
| value "gul" | Adressen ligger i gul støysone fra vei, med 55–65 dB ({src}). | 3 |
| no warning | Adressen ligger ikke i en støysone fra riks- eller fylkesvei ({src}). | 5 |

Note: the noise map has no data on municipal roads. Oslo is marked "no coverage" in the profile (then the point is listed under "Missing data"). Elsewhere, the "no warning" sentence must keep "riks- eller fylkesvei" so it stays true.

**`roadNoiseStrategic` (Veistøy, strategisk støykart)**

| When | Sentence | Rank |
|---|---|---|
| warning, value ≥ 65 | Adressen har beregnet veistøy på {band} i det strategiske støykartet fra {year} ({src}). | 2 |
| warning, value 55–64 | Adressen har beregnet veistøy på {band} i det strategiske støykartet fra {year} ({src}). | 3 |
| no warning, value ≥ 55 | Adressen har beregnet veistøy på {band} i det strategiske støykartet fra {year} ({src}). | 4 |
| value 50–54 | Adressen har beregnet veistøy på {band} i det strategiske støykartet fra {year} ({src}). | 6 |

`{display}` is "65–70 dB (2021)": `{band}` is the part before the brackets, `{year}` the year in them. Example (Arendalsgata 22): "Adressen har beregnet veistøy på 65–70 dB i det strategiske støykartet fra 2021 (Statens vegvesen)."

It only warns in Oslo. Outside Oslo, `roadNoise` already gives the warning: don't write two warning sentences about the same noise. When it is missing, it goes under "Missing data" (no zone = unknown, never "stille").

**`railNoise` (Jernbanestøy)**

| When | Sentence | Rank |
|---|---|---|
| value "rød" | Adressen ligger i rød støysone fra jernbane{line}, med 68 dB eller mer ({src}). | 2 |
| value "gul" | Adressen ligger i gul støysone fra jernbane{line}, med 58–68 dB ({src}). | 3 |
| no warning | Adressen ligger ikke i en støysone fra jernbanen ({src}). | 5 |

`{display}` is "Rød støysone fra jernbane, Drammenbanen (over 68 dB)": `{line}` is ", Drammenbanen" (the part between "jernbane" and the brackets, or nothing). The "no warning" sentence is only about trains: never say the address is quiet (T-bane and trikk are not in the map).

**`aircraftNoise` (Flystøy)**

| When | Sentence | Rank |
|---|---|---|
| value "rød" | Adressen ligger i rød flystøysone fra {airport}, med 62 dB eller mer ({src}). | 2 |
| value "gul" | Adressen ligger i gul flystøysone fra {airport}, med 52–62 dB ({src}). | 3 |
| no warning | Adressen ligger ikke i en flystøysone fra Avinors lufthavner ({src}). | 5 |

`{display}` is "Rød flystøysone, Oslo lufthavn Gardermoen (over 62 dB)": `{airport}` is the text between the comma and the brackets. Example (3209-2340-35): "Adressen ligger i rød flystøysone fra Oslo lufthavn Gardermoen, med 62 dB eller mer (Avinor)."
Road and aircraft noise are different sources, so an address can get one sentence for each. The "no warning" sentence must keep "Avinors lufthavner" so it stays true (helicopters and military airfields are not in the map).

**`pollutedGround` (Forurenset grunn)**

| When | Sentence | Rank |
|---|---|---|
| warning | Det er registrert et sted med mulig forurenset grunn {value} meter fra adressen ({src}). | 3 |
| no warning | Det er ikke registrert forurenset grunn innen 100 meter fra adressen ({src}). | 5 |

### Location

Distances are in a straight line. Say so once ("i luftlinje"), so the summary does not suggest walking distance.
Rank for "value is a number": 6 when the data point's `effect` is good, 4 when it is bad (far away).
`{display}` here is "31 m (Arendalsgata)": `{name}` is the text in brackets, `{distance}` the part before it.
Example (Holmenkollveien 196): "Nærmeste holdeplass er Frognerseteren, 155 m unna i luftlinje (Entur)."

**`transitStop` (Nærmeste holdeplass)**

| When | Sentence | Rank |
|---|---|---|
| value is a number | Nærmeste holdeplass er {name}, {distance} unna i luftlinje ({src}). | 6 |
| value is empty | Det er ingen holdeplass innen 2 km i luftlinje ({src}). | 4 |

**`transitDepartures` (Avganger innen 500 m)**

The busiest stop within 500 m in a straight line, counted on one normal weekday. `{display}` is "161 avganger, 2 linjer (Jegeråsen, 212 m)": `{lines}` is the number before "linje"/"linjer", `{name}` and `{distance}` are in the brackets.

| When | Sentence | Rank |
|---|---|---|
| value > 0, 1 line | Fra {name}, {distance} unna i luftlinje, går det {value} avganger på en vanlig hverdag med 1 linje ({src}). | 6 if good, 4 if bad |
| value > 0, more lines | Fra {name}, {distance} unna i luftlinje, går det {value} avganger på en vanlig hverdag fordelt på {lines} linjer ({src}). | 6 if good, 4 if bad |
| value 0 | Det går ingen kollektivavganger fra holdeplasser innen 500 meter i luftlinje på en vanlig hverdag ({src}). | 4 |

Example (Grevlingåsen 17): "Fra Jegeråsen, 212 m unna i luftlinje, går det 161 avganger på en vanlig hverdag fordelt på 2 linjer (Entur)."
Say "på en vanlig hverdag", never "per dag" or "hver dag": weekends have fewer. If this stop is also the nearest stop (`transitStop`), one sentence may cover both.

**`school` (Nærmeste grunnskole)**

| When | Sentence | Rank |
|---|---|---|
| value is a number | Nærmeste grunnskole er {name}, {distance} unna i luftlinje ({src}). | 6 |
| value is empty | Det er ingen grunnskole innen 5 km i luftlinje ({src}). | 4 |

Never call it "skolen adressen hører til": we do not know the school catchment.

**`kindergarten` (Nærmeste barnehage)**

| When | Sentence | Rank |
|---|---|---|
| value is a number | Nærmeste barnehage er {name}, {distance} unna i luftlinje ({src}). | 6 |
| value is empty | Det er ingen barnehage innen 3 km i luftlinje ({src}). | 4 |

**`groceryStore`, `pharmacy`, `doctor`** (from OpenStreetMap: `{src}` is "OpenStreetMap")

| When | Sentence | Rank |
|---|---|---|
| `groceryStore`, value is a number | Nærmeste dagligvarebutikk er {name}, {distance} unna i luftlinje ({src}). | rule above |
| `groceryStore`, value is empty | Det er ingen registrert dagligvarebutikk innen 3 km i luftlinje ({src}). | 4 |
| `pharmacy`, value is a number | Nærmeste apotek er {name}, {distance} unna i luftlinje ({src}). | rule above |
| `pharmacy`, value is empty | Det er ikke registrert noe apotek innen 5 km i luftlinje ({src}). | 4 |
| `doctor`, value is a number | Nærmeste legekontor er {name}, {distance} unna i luftlinje ({src}). | rule above |
| `doctor`, value is empty | Det er ikke registrert noe legekontor innen 5 km i luftlinje ({src}). | 4 |

Example (Grevlingåsen 17): "Nærmeste dagligvarebutikk er Kiwi Hosle, 519 m unna i luftlinje (OpenStreetMap)." Never suggest that the nearest doctor is the address's fastlege.

### Nature & leisure

**`trails` (Nærmeste tursti eller skiløype)**

| When | Sentence | Rank |
|---|---|---|
| value is a number | Nærmeste registrerte tursti eller skiløype er {name}, {distance} unna i luftlinje ({src}). | 6 |
| value is a number, {name} is "Tursti", "Skiløype", "Sykkelrute" or "Turrute" (a route with no name) | Nærmeste registrerte {name in lower case} er {distance} unna i luftlinje ({src}). | 6 |

Example (Grevlingåsen 17): "Nærmeste registrerte tursti er 32 m unna i luftlinje (Kartverket)." Not "… er Tursti, 32 m unna".
| value is empty | Det er ingen registrert tursti eller skiløype innen 3 km i luftlinje ({src}). | 4 |

**`protectedNature` (Nærmeste verneområde)** and **`recreationArea` (Nærmeste sikra friluftsområde)**

| When | Sentence | Rank |
|---|---|---|
| `protectedNature`, value 0 | Adressen ligger inne i {name} ({src}). | 6 |
| `protectedNature`, value is a number | Nærmeste verneområde er {name}, {distance} unna i luftlinje ({src}). | 6 |
| `protectedNature`, value is empty | Det er ikke noe verneområde innen 3 km i luftlinje ({src}). | 6 |
| `recreationArea`, value 0 | Adressen ligger inne i det statlig sikra friluftsområdet {name} ({src}). | 6 |
| `recreationArea`, value is a number | Nærmeste statlig sikra friluftsområde er {name}, {distance} unna i luftlinje ({src}). | 6 |
| `recreationArea`, value is empty | Det er ikke noe statlig sikra friluftsområde innen 3 km i luftlinje ({src}). | 6 |

`{display}` is "Kalvøya naturreservat, 662 m": `{name}` is the part before the last comma, `{distance}` the part after it. When value is 0, `{display}` is "Inne i <name>". Example (Gamle Drammensvei 207): "Nærmeste verneområde er Kalvøya naturreservat, 662 m unna i luftlinje (Miljødirektoratet)."

### Area

Area numbers are for the whole municipality. Always say "i kommunen", never "i nabolaget".

| Data point | Sentence | Rank |
|---|---|---|
| `municipality` | Adressen ligger i {display} ({src}). | 6 |
| `population` | Kommunen hadde {value} innbyggere i {year} ({src}). | 6 |
| `medianIncome` | Medianinntekten etter skatt for husholdninger i kommunen var {value} kr i {year} ({src}). | 6 |
| `areaIncome` | Medianinntekten etter skatt for husholdninger i {area} var {value} kr i {year}, mot {kommune} kr i hele kommunen ({src}). | 6 |
| `crimeRate`, kommune | Det ble anmeldt {value} lovbrudd per 1000 innbyggere i kommunen i snitt per år i {period}, mot {norway} i hele landet ({src}). | 6 |
| `crimeRate`, Oslo bydel | Det ble anmeldt {value} lovbrudd per 1000 innbyggere i {area} i {period}, mot {oslo} i hele Oslo og {norway} i landet ({src}). | 6 |
| `violentCrime`, kommune | Det ble anmeldt {value} saker om vold og mishandling per 1000 innbyggere i kommunen i snitt per år i {period}, mot {norway} i hele landet ({src}). | 6 |
| `violentCrime`, Oslo bydel | Det ble anmeldt {value} saker om vold og mishandling per 1000 innbyggere i {area} i {period}, mot {oslo} i hele Oslo og {norway} i landet ({src}). | 6 |
| either, value empty (Sentrum bydel) | Det ble anmeldt {count} lovbrudd i {area} i {period}, men så få bor der at et tall per innbygger ikke gir mening ({src}). | 6 |

- `{year}` is the year in brackets at the end of `{display}` ("728 714 (2026)" → 2026). Write `{value}` with spaces between thousands, as in `{display}`.
- `municipality`: `{display}` is "Bærum (Akershus)". When the two names are the same, write the name once: "Adressen ligger i Oslo (Kartverket)."

**`neighbourhood` (Nabolaget)** and **`neighbourhoodAge` (Aldersfordeling i nabolaget)**

| When | Sentence | Rank |
|---|---|---|
| `neighbourhood` | Adressen ligger i grunnkretsen {name}, som hadde {value} innbyggere i {year} ({src}). | 6 |
| `neighbourhoodAge` | I grunnkretsen er {under20} % av innbyggerne under 20 år og {over70} % over 70 år ({src}). | 6 |

`neighbourhood` `{display}` is "Hosle nord 06: 220 innbyggere, 1 234 per km² (2025)": `{name}` is the part before the colon, `{year}` the year in brackets. `neighbourhoodAge` `{display}` is "9 % under 20 år, 5 % over 70 år": `{under20}` and `{over70}` are the two numbers. Say "grunnkretsen", not "nabolaget": a grunnkrets is SSB's area, not what people call their neighbourhood.

**`culturalHeritage` (Kulturminner innen 50 m)**

| When | Sentence | Rank |
|---|---|---|
| value is empty | Det er ikke registrert kulturminner med vern innen 50 m fra adressen ({src}). | 6 |
| value set, `{display}` has "på adressen" | Adressen ligger innenfor et registrert kulturminne: {name}, {status} ({src}). | 6 |
| value set | Det er registrert et kulturminne {distance} fra adressen: {name}, {status} ({src}). | 6 |

`{display}` is "Myren arbeiderboliger - Arendalsgata (vernet etter plan- og bygningsloven), 26 m unna, og 1 til": `{name}` is the text before the last bracket pair, `{status}` the text in it, `{distance}` the "26 m" part. Leave out "og 1 til". Example (Arendalsgata 22): "Det er registrert et kulturminne 26 m fra adressen: Myren arbeiderboliger - Arendalsgata, vernet etter plan- og bygningsloven (Riksantikvaren)."
Use `{status}` exactly. Only write "fredet" when the status says so ("kommunalt listeført" is not fredet).

`areaIncome`: `{display}` is "711 200 kr i Østerås (2024), kommunen 650 000 kr": `{area}` is the name after "i", `{kommune}` the number after "kommunen" (leave out ", mot …" when it is missing). It is about SSB's delområde, not the street.

Crime (`crimeRate`, `violentCrime`): kommune `{display}` is "51,7 per 1000 innbyggere (2024–2025), landet 59,9"; Oslo bydel `{display}` is "81,7 per 1000 innbyggere i Sagene bydel (2024), Oslo 88, landet 59,9" (has " i … bydel"). `{value}` is the first number, `{area}` the "… bydel" text, `{period}` the year(s) in brackets, `{oslo}` and `{norway}` the numbers after "Oslo" and "landet". Sentrum `{display}` is "12 345 anmeldt i Sentrum bydel (2024), få bor der": `{count}` is the first number. `{src}` is Oslo kommune for a bydel, SSB for a kommune. When `{display}` ends with "inkl. Gardermoen" (Ullensaker), add: "Tallet tar med lovbrudd på Oslo lufthavn Gardermoen." Never call an area "trygt" or "utrygt": these are numbers for the whole municipality, not for the neighbourhood.

Example (Arendalsgata 22): "Kommunen hadde 728 714 innbyggere i 2026 (SSB)." and "Medianinntekten etter skatt for husholdninger i kommunen var 635 200 kr i 2024 (SSB)."

## Missing data (rank 7)

Group the missing data points by reason and write one sentence per reason. List labels in lower case, joined with commas and "og" before the last.

| Reason | Sentence |
|---|---|
| `notLoaded` | Vi har ikke data om {labels} ennå. |
| `noCoverage` | Kildene har ingen data om {labels} for dette stedet. |
| `sourceUnavailable` | Data om {labels} var ikke tilgjengelig da sammendraget ble laget. |

The summary must never fill a gap: if radon is missing, it says we don't know, not "no radon".

Exception: when `quickClay` or `flood200` is "not mapped", use its own sentence from "Natural hazards" instead of putting it in a group here.

## Rating (rank 8, always last)

| When | Sentence |
|---|---|
| status ok, with weakest category | Samlet karakter er {score} av 100. Svakest er {weakest category name in lower case} med {weakest score}. |
| status ok, no weakest category | Samlet karakter er {score} av 100. |
| status insufficientData or unavailable | {reason} (the profile's reason, as it is) |

## Check against the test addresses

From `docs/TEST_ADDRESSES.md`. After a change here or in `summary.ts`, the facts must give:

| # | Address | Must be in the facts | Must not be in the facts |
|---|---|---|---|
| 1 | Arendalsgata 22 | Kvikkleire, høy faregrad (rank 1). Veistøy 65–70 dB from the strategic map (rank 2) | Any T-1442 noise zone (no coverage in Oslo) |
| 2 | Nedre Rælingsveg 148 | 200-årsflom (rank 2). Rød støysone (rank 2) | A second noise warning (strategic map does not warn outside Oslo) |
| 3 | Gamle Drammensvei 207 | Rød støysone (rank 2). Meget høy radonaktsomhet (rank 2). "NVE har ikke kartlagt ..." for quick clay and "NVE har ikke laget flomsonekart ..." (rank 7) | A quick-clay or flood zone sentence (the address is outside NVE's mapping) |
| 4 | Grevlingåsen 17 | Høy radonaktsomhet (rank 2). No noise zone, no rockfall/debris/avalanche area (rank 5). "NVE har ikke kartlagt ..." for quick clay and "NVE har ikke laget flomsonekart ..." (rank 7). Jegeråsen, 161 avganger | Any other warning. Any sentence saying the address is outside a quick-clay or flood zone |
| 5 | Holmenkollveien 196 | Høy radonaktsomhet (rank 2). Frognerseteren as nearest stop. "NVE har ikke kartlagt ..." for quick clay and "NVE har ikke laget flomsonekart ..." (rank 7) | A quick-clay or flood zone sentence. A noise warning (50–55 dB is below the yellow level) |

Checked against the API on 2026-11-07: all three match. The storm-surge fact still comes out as the plain fallback "Stormflo: Ikke i stormflosone (Kartverket)." until the `stormSurge` rule above is in `RULES` in `api/src/summary.ts`.
