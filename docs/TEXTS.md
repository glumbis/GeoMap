# Info texts

Owner: Even. Plain-Norwegian texts that tell someone living at the address what a data point means.
They go in the optional `explanation` field of a data point (`docs/PROFILE.md`); the web app shows them when a data point is opened.

How to use this file:
- One section per data point, headed by its `id` from `api/src/datapoints.ts`.
- **Forklaring** is the main text: always shown.
- **Når ...** lines are extra texts for one outcome. Show the matching one after the main text, if any.
- Rules for the texts: bokmål, plain words, at most 2 sentences each. Explain, don't advise. Never make a risk sound bigger or smaller than the data says. Say what the data does *not* tell.
- New data point → add a section here in the same shape.

---

## Grunn og geologi

### `soilType` — Løsmasser
**Forklaring:** Løsmasser er det som ligger over fjellet, for eksempel leire, sand, grus eller morene. Typen sier noe om hvor stabil grunnen er og hvor lett vann renner unna.
- **Når marin leire:** Marin leire ble avsatt i havet etter siste istid. Den kan gi setningsskader på bygninger og kan noen steder inneholde kvikkleire.
- Kartet er grovt og viser ikke nøyaktig hva som ligger under akkurat denne tomten.

### `bedrock` — Berggrunn
**Forklaring:** Berggrunnen er fjellet under løsmassene. Bergarten påvirker blant annet hvor mye radon som kan komme fra grunnen og hvor godt egnet grunnen er å bygge på.
- **Når alunskifer:** Alunskifer kan svelle og skade grunnmurer, gir surt vann når den graves opp, og gir ofte mye radon. Det har mest å si ved graving og bygging.
- **Når oversiktskart:** Bergarten er hentet fra et grovt kart (1:250 000), så den kan være en annen akkurat på denne tomten.

### `radon` — Radon
**Forklaring:** Radon er en radioaktiv gass fra berggrunnen som kan sive inn i hus. Det er den viktigste årsaken til lungekreft etter røyking.
- **Når høy eller meget høy aktsomhet:** Det er større sjanse enn ellers for at hus i området har for mye radon. Bare en måling i huset kan si hvor mye radon det faktisk er.
- **Når middels aktsomhet:** Noen hus i området kan ha for mye radon. Bare en måling i huset kan si hvor mye det faktisk er.
- **Når lav aktsomhet:** Det er mindre sjanse for høye radonverdier, men enkelthus kan likevel ha mye radon.

## Naturfare

### `quickClay` — Kvikkleire faresone
**Forklaring:** Kvikkleire er leire som kan bli flytende når den blir forstyrret, og da kan store områder gli ut. NVE har kartlagt soner der et slikt skred kan skje.
- **Når i faresone:** Faregraden (lav, middels eller høy) sier hvor sannsynlig et skred er, ikke hvor stor skaden blir. Kommunen kan stille krav til grunnundersøkelser før det bygges eller graves.
- **Når i kartlagt sone uten faregrad:** NVE har kartlagt kvikkleire her, men ikke vurdert hvor sannsynlig et skred er. Kommunen kan likevel kreve grunnundersøkelser før det bygges eller graves.
- **Når ikke i faresone (kartlagt område):** NVE har kartlagt området og ikke registrert noen faresone der adressen ligger.
- **Når ikke kartlagt:** NVE har ikke kartlagt kvikkleire i dette området, så kartet sier ingenting om grunnen her. Der det er marin leire i grunnen, kan det likevel finnes kvikkleire.

### `flood200` — Flomsone (200-årsflom)
**Forklaring:** En 200-årsflom er en flom som i gjennomsnitt kommer én gang hvert 200. år. Det betyr omtrent 0,5 % sjanse hvert år, eller rundt 1 av 5 i løpet av 50 år.
- **Når i flomsone:** Området kan bli oversvømt ved en slik flom. Nye boliger skal som hovedregel være sikret mot 200-årsflom.
- **Når ikke i flomsone (kartlagt område):** NVE har laget flomsonekart her, og adressen ligger utenfor sonene. Adressen kan likevel få vann fra bekker, overvann eller kraftig regn.
- **Når ikke kartlagt:** NVE har bare laget flomsonekart langs noen elver og vassdrag, og ikke her. Kartet sier derfor ingenting om flomfare på denne adressen.

### `rockfall` — Steinsprang
**Forklaring:** Steinsprang er når stein løsner fra bratte fjellsider og faller eller ruller ned. Aktsomhetsområder viser hvor stein i verste fall kan nå, beregnet ut fra terrenget.
- **Når i aktsomhetsområde:** Kartet er grovt og ikke sjekket på stedet, så forholdene på tomten kan avvike fra kartet. Det kan ikke brukes alene til å vurdere én enkelt tomt.

### `debrisFlow` — Jord- og flomskred
**Forklaring:** Jordskred og flomskred er når løsmasser i bratte skråninger eller bekkeløp raser ut, ofte etter mye regn eller snøsmelting. Aktsomhetsområder viser hvor slike skred er mulige, beregnet ut fra terrenget.
- **Når i aktsomhetsområde:** Kartet er grovt og ikke sjekket på stedet, så forholdene på tomten kan avvike fra kartet. Det kan ikke brukes alene til å vurdere én enkelt tomt.

### `avalanche` — Snøskred
**Forklaring:** Aktsomhetsområder for snøskred viser hvor snøskred kan løsne og hvor langt de kan nå, beregnet ut fra terrenget. Kartet er grovt og ikke sjekket på stedet.
- **Når i aktsomhetsområde:** Snøskred kan i verste fall nå hit, også med skogen som står i dag.
- **Når bare uten skog:** Skogen over beskytter i dag. Hvis skogen hogges eller dør, kan snøskred nå hit.

### `stormSurge` — Stormflo
**Forklaring:** Stormflo er når havet stiger over vanlig høyvann, ofte på grunn av sterk vind og lavt lufttrykk. Kartverket har beregnet hvilke områder langs kysten som kan bli oversvømt ved 20-års- og 200-årsstormflo, i dag og med havnivået som er ventet i år 2100.
- **Når i stormflosone i dag:** Området kan bli oversvømt fra sjøen ved en slik stormflo. Nye boliger skal som hovedregel være sikret mot 200-årsstormflo.
- **Når bare i år 2100:** Området er ikke utsatt i dag, men kan bli det når havet stiger.
- **Når ikke i stormflosone:** Adressen ligger utenfor sonene Kartverket har beregnet. Kartet gjelder bare vann fra sjøen, ikke fra elver eller regn.

## Miljø

### `roadNoise` — Veistøy
**Forklaring:** Støysonene viser beregnet støy fra riks- og fylkesveier, som et snitt over døgnet der kveld og natt teller mer. Kartet er en prognose for om 15–20 år, målt 4 meter over bakken.
- **Når rød sone (65 dB eller mer):** Støyen er så høy at området regnes som lite egnet for boliger. Etter retningslinjen T-1442 bør nye boliger som hovedregel unngås her.
- **Når gul sone (55–65 dB):** Støyen er merkbar, og kommunen vurderer støy særskilt når det skal bygges nytt.
- **Når ikke i støysone:** Kartet viser bare støy fra riks- og fylkesveier, ikke fra kommunale veier, tog, trikk eller fly. I Oslo har kartet ingen data.

### `roadNoiseStrategic` — Veistøy (strategisk støykart)
**Forklaring:** Kartet viser beregnet støy fra veitrafikk i 2021, også fra kommunale veier, som et snitt over døgnet der kveld og natt teller mer. Tallet er et intervall på 5 dB, for eksempel 60–65 dB.
- **Når 65 dB eller mer:** Støyen er på nivå med rød støysone, der området regnes som lite egnet for boliger.
- **Når 55–65 dB:** Støyen er merkbar, på nivå med gul støysone.
- **Når 50–55 dB:** Det er noe trafikkstøy, men under nivået for gul sone.
- Uten treff vet vi ikke om det er stille eller om stedet ikke er kartlagt, så da vises det som ikke tilgjengelig.

### `aircraftNoise` — Flystøy
**Forklaring:** Avinor har beregnet støysoner rundt Oslo lufthavn Gardermoen, som et snitt over døgnet der kveld og natt teller mer. Sonene bygger på ventet flytrafikk og sier ikke hvor ofte eller hvor lavt flyene går over akkurat denne adressen.
- **Når rød sone (62 dB eller mer):** Flystøyen er så høy at området regnes som lite egnet for boliger. Etter retningslinjen T-1442 bør nye boliger som hovedregel unngås her.
- **Når gul sone (52–62 dB):** Flystøyen er merkbar, og kommunen vurderer støy særskilt når det skal bygges nytt.
- **Når ikke i sone:** Adressen ligger utenfor støysonene til Avinors lufthavner. Det kan likevel høres fly, og kartet tar ikke med helikopter, militære flyplasser eller små flyplasser.

### `pollutedGround` — Forurenset grunn
**Forklaring:** Miljødirektoratet registrerer steder der grunnen er eller kan være forurenset, for eksempel gamle fyllinger, industritomter og skytebaner.
- **Når registrert i nærheten:** At et sted er registrert, betyr ikke alltid at grunnen faktisk er forurenset. Det har mest å si hvis man skal grave, bygge eller dyrke i jorda.

## Beliggenhet

### `transitStop` — Nærmeste holdeplass
**Forklaring:** Avstanden er målt i luftlinje til nærmeste stopp for buss, trikk, T-bane, tog eller båt. Gangveien kan være lengre.
- Tallet sier ikke hvor ofte det går avganger fra stoppet.

### `transitDepartures` — Avganger innen 500 m
**Forklaring:** Antall avganger på en vanlig hverdag fra den travleste holdeplassen innen 500 meter i luftlinje, med alle linjer som stopper der. Det kan si mer om hvor lett det er å reise kollektivt enn avstanden til nærmeste stopp alene.
- **Når ingen avganger:** Det finnes ingen holdeplass med faste avganger innen 500 meter. Det kan gå bestillingstransport eller skolebuss som ikke er med i tallet.
- Helger og ferier har ofte færre avganger.

### `school` — Nærmeste grunnskole
**Forklaring:** Avstanden er målt i luftlinje til nærmeste barne- eller ungdomsskole. Det er ikke sikkert dette er skolen adressen hører til, for kommunen bestemmer skolekretsen, og skolen kan være privat.

### `kindergarten` — Nærmeste barnehage
**Forklaring:** Avstanden er målt i luftlinje til nærmeste barnehage. Kommunen tildeler barnehageplass etter egne kriterier.

## Natur og friluft

### `trails` — Nærmeste tursti eller skiløype
**Forklaring:** Avstanden er målt i luftlinje til nærmeste registrerte tursti, sykkelrute eller skiløype. Ikke alle stier og løyper er registrert, og skiløyper er bare preparert når det er snø.

## Område

### `municipality` — Kommune
**Forklaring:** Kommunen bestemmer blant annet byggesaker, skolekretser, barnehageplasser, kommunale avgifter og eventuell eiendomsskatt.

### `population` — Folketall i kommunen
**Forklaring:** Antall innbyggere i hele kommunen per 1. januar. Tallet sier ikke hvor tett det bor folk akkurat rundt adressen.

### `medianIncome` — Medianinntekt etter skatt (husholdning)
**Forklaring:** Halvparten av husholdningene i kommunen har mer enn dette etter skatt, og halvparten har mindre. Inntektene kan variere mye mellom ulike deler av kommunen, særlig i Oslo.

---

## Ready for data points not added yet

The `ssb_kommuner` table also has these numbers (see `SOURCES.md`). If they become data points, use these texts.

### Aldersfordeling (`agePct0to17`, `agePct18to66`, `agePct67plus`)
**Forklaring:** Andelen av innbyggerne i kommunen som er barn (0–17 år), i arbeidsfør alder (18–66 år) og eldre (67 år og over).

### Boligtyper (`housingPct*`)
**Forklaring:** Hvor stor andel av boligene i kommunen som er eneboliger, tomannsboliger, rekkehus eller leiligheter i blokk.

### Utdanning (`educationPctHigher`)
**Forklaring:** Andelen av innbyggere over 16 år i kommunen som har fullført universitet eller høyskole.
