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

### `marineClay` — Mulighet for marin leire
**Forklaring:** Marin leire ble avsatt i havet etter istiden, og kvikkleire kan bare dannes i marin leire. NGU viser hvor ofte det finnes marin leire i grunnen, men det er ikke en faresone.
- **Når ofte marin leire:** Marin leire er vanlig her og kan gi setningsskader på bygninger. Om det er kvikkleire i grunnen, kan bare boring og prøver vise.
- **Når over marin grense:** Havet sto aldri så høyt her etter istiden, så det finnes ikke marin leire, eller så har NGU ikke vurdert området.

### `energyWell` — Nærmeste energibrønn
**Forklaring:** En energibrønn er et borehull i fjellet som henter varme til en bergvarmepumpe. Avstanden er i luftlinje til nærmeste brønn i NGUs brønndatabase, og dybden til fjell er det brønnboreren målte der.
- **Når ingen brønn i nærheten:** Det er ikke registrert noen energibrønn innen 500 meter. Det betyr ikke at det ikke går an å bore her, for ikke alle brønner er registrert.
- Dybden til fjell kan endre seg mye over korte avstander, så den kan være en annen akkurat på denne tomten.

## Naturfare

### `quickClay` — Kvikkleire faresone
**Forklaring:** Kvikkleire er leire som kan bli flytende når den blir forstyrret, og da kan store områder gli ut. NVE har kartlagt soner der et slikt skred kan skje.
- **Når i faresone:** Faregraden (lav, middels eller høy) sier hvor sannsynlig et skred er, ikke hvor stor skaden blir. Kommunen kan stille krav til grunnundersøkelser før det bygges eller graves.
- **Når i kartlagt sone uten faregrad:** NVE har kartlagt kvikkleire her, men ikke vurdert hvor sannsynlig et skred er. Kommunen kan likevel kreve grunnundersøkelser før det bygges eller graves.
- **Når ikke i faresone (kartlagt område):** NVE har kartlagt området og ikke registrert noen faresone der adressen ligger.
- **Når ikke kartlagt:** NVE har ikke kartlagt kvikkleire i dette området, så kartet sier ingenting om grunnen her. Der det er marin leire i grunnen, kan det likevel finnes kvikkleire.

### `quickClayAwareness` — Aktsomhetsområde for kvikkleireskred
**Forklaring:** NVE har vurdert hvor det kan gå kvikkleireskred, ut fra terrenget og hvor det kan være marin leire. Kartet er mye grovere enn faresonene for kvikkleire, men dekker langt større områder.
- **Når i aktsomhetsområde:** Det betyr ikke at det er kvikkleire her, men at grunnen må undersøkes av en geotekniker før det bygges eller graves.
- **Når ikke i aktsomhetsområde:** NVE har vurdert området uten å sette et aktsomhetsområde her. Det sier ikke noe om grunnen akkurat på denne tomten.
- **Når ikke kartlagt:** NVE har ikke vurdert kvikkleireskred for dette området ennå, så vi vet ikke.

### `flood200` — Flomsone (200-årsflom)
**Forklaring:** En 200-årsflom er en flom som i gjennomsnitt kommer én gang hvert 200. år. Det betyr omtrent 0,5 % sjanse hvert år, eller rundt 1 av 5 i løpet av 50 år.
- **Når i flomsone:** Området kan bli oversvømt ved en slik flom. Nye boliger skal som hovedregel være sikret mot 200-årsflom.
- **Når ikke i flomsone (kartlagt område):** NVE har laget flomsonekart her, og adressen ligger utenfor sonene. Adressen kan likevel få vann fra bekker, overvann eller kraftig regn.
- **Når ikke kartlagt:** NVE har bare laget flomsonekart langs noen elver og vassdrag, og ikke her. Kartet sier derfor ingenting om flomfare på denne adressen.

### `floodAwareness` — Aktsomhetsområde for flom
**Forklaring:** NVE har beregnet hvilke områder langs alle elver og bekker som kan bli oversvømt, ut fra terrenget. Kartet er grovere enn flomsonekartene, men dekker hele landet.
- **Når i aktsomhetsområde:** Flomfaren må vurderes nærmere før det bygges nytt. Det betyr ikke at eiendommen har vært oversvømt.
- **Når ikke i aktsomhetsområde:** Kartet gjelder flom fra elver og bekker, ikke vann fra kraftig regn eller fra sjøen.

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

### `railNoise` — Jernbanestøy
**Forklaring:** Støysonene viser beregnet støy fra Bane NORs jernbane, som et snitt over døgnet der kveld og natt teller mer. T-bane og trikk er ikke med.
- **Når rød sone (68 dB eller mer):** Støyen er så høy at området regnes som lite egnet for boliger. Etter retningslinjen T-1442 bør nye boliger som hovedregel unngås her.
- **Når gul sone (58–68 dB):** Støyen er merkbar, og kommunen vurderer støy særskilt når det skal bygges nytt.
- **Når ikke i støysone:** Adressen ligger utenfor Bane NORs støysoner. Tog kan likevel høres, og T-bane og trikk er ikke med i kartet.

### `aircraftNoise` — Flystøy
**Forklaring:** Avinor har beregnet støysoner rundt Oslo lufthavn Gardermoen, som et snitt over døgnet der kveld og natt teller mer. Sonene bygger på ventet flytrafikk og sier ikke hvor ofte eller hvor lavt flyene går over akkurat denne adressen.
- **Når rød sone (62 dB eller mer):** Flystøyen er så høy at området regnes som lite egnet for boliger. Etter retningslinjen T-1442 bør nye boliger som hovedregel unngås her.
- **Når gul sone (52–62 dB):** Flystøyen er merkbar, og kommunen vurderer støy særskilt når det skal bygges nytt.
- **Når ikke i sone:** Adressen ligger utenfor støysonene til Avinors lufthavner. Det kan likevel høres fly, og kartet tar ikke med helikopter, militære flyplasser eller små flyplasser.

### `pollutedGround` — Forurenset grunn
**Forklaring:** Miljødirektoratet registrerer steder der grunnen er eller kan være forurenset, for eksempel gamle fyllinger, industritomter og skytebaner.
- **Når registrert i nærheten:** At et sted er registrert, betyr ikke alltid at grunnen faktisk er forurenset. Det har mest å si hvis man skal grave, bygge eller dyrke i jorda.

### `wind` — Vind (hovedvindretning)
**Forklaring:** Hvor vinden oftest blåser fra, målt time for time siden 2016 på nærmeste værstasjon fra Meteorologisk institutt. Retningen sier hvilken side av huset som får mest vind, og hvor uteplassen får mest le. Vindrosen i rapporten viser alle retninger og hvor sterk vinden er. Dette er bare informasjon og teller ikke i poengsummen.

### `powerLine` — Nærmeste høyspentlinje
**Forklaring:** Avstanden er målt i luftlinje til nærmeste luftledning i regional- eller transmisjonsnettet, med spenning fra NVE. Lavspente linjer og jordkabler i det lokale strømnettet er ikke med.
- Magnetfeltet fra en kraftlinje avtar raskt med avstanden. Ved noen titalls meter fra de største linjene er det som regel på nivå med vanlige boliger, men det varierer med strømmen i linjen. Direktoratet for strålevern og atomsikkerhet (DSA) kan svare på spørsmål om magnetfelt.

### `trafficVolume` — Mest trafikkerte vei innen 100 m
**Forklaring:** Gjennomsnittlig antall kjøretøy i døgnet (ÅDT) i begge retninger på den mest trafikkerte veien innen 100 meter i luftlinje, fra Statens vegvesen. Mye trafikk kan bety mer støy, støv og eksos, og at veien er vanskeligere å krysse.
- Statens vegvesen har tall for europa-, riks- og fylkesveier og noen kommunale veier, men ikke for de fleste små boliggater. Det kan derfor gå en vei med lite trafikk nærmere enn den som vises.

## Beliggenhet

### `transitStop` — Nærmeste holdeplass
**Forklaring:** Avstanden er målt i luftlinje til nærmeste stopp for buss, trikk, T-bane, tog eller båt. Gangveien kan være lengre.
- Tallet sier ikke hvor ofte det går avganger fra stoppet.

### `transitDepartures` — Avganger innen 500 m
**Forklaring:** Antall avganger på en vanlig hverdag fra den travleste holdeplassen innen 500 meter i luftlinje, med alle linjer som stopper der. Det kan si mer om hvor lett det er å reise kollektivt enn avstanden til nærmeste stopp alene.
- **Når ingen avganger:** Det finnes ingen holdeplass med faste avganger innen 500 meter. Det kan gå bestillingstransport eller skolebuss som ikke er med i tallet.
- Helger og ferier har ofte færre avganger.

### `cityBike` — Nærmeste bysykkelstasjon
**Forklaring:** Avstanden er målt i luftlinje til nærmeste stasjon for Oslo Bysykkel, der man kan låne og levere sykkel med en app. Bysykkelen finnes bare i Oslo, og mest i de sentrale bydelene. Om vinteren er det færre eller ingen sykler ute.

### `trafficAccidents` — Trafikkulykker innen 200 m
**Forklaring:** Antall trafikkulykker med personskade som politiet har registrert innen 200 meter i luftlinje siden 2016, fra Statens vegvesen, og hvor mange av dem som gjaldt en fotgjenger eller syklist. Det kan si noe om hvor trygg veien til skole og butikk er.
- Ulykker uten personskade er ikke med, og noen ulykker med lettere skader blir aldri meldt til politiet. Steder med mye trafikk får naturlig flere ulykker.

### `school` — Nærmeste grunnskole
**Forklaring:** Avstanden er målt i luftlinje til nærmeste barne- eller ungdomsskole. Det er ikke sikkert dette er skolen adressen hører til, for kommunen bestemmer skolekretsen, og skolen kan være privat.

### `schoolBullying` — Mobbing på nærmeste grunnskole
**Forklaring:** Andelen elever ved nærmeste grunnskole som svarte i Elevundersøkelsen at de er blitt mobbet de siste månedene, på det høyeste trinnet som ble spurt (7. eller 10. trinn), sammenlignet med landet. Skolen er den samme som i "Nærmeste grunnskole", og det er ikke sikkert det er skolen adressen hører til.
- Ved små skoler svarer få elever, så noen få svar kan endre tallet mye fra år til år. Udir viser ikke tallet når for få har svart.

### `kindergarten` — Nærmeste barnehage
**Forklaring:** Avstanden er målt i luftlinje til nærmeste barnehage. Kommunen tildeler barnehageplass etter egne kriterier.

### `groceryStore` — Nærmeste dagligvarebutikk
**Forklaring:** Avstanden er i luftlinje til nærmeste dagligvarebutikk, for eksempel Kiwi, Rema 1000, Extra, Meny eller Joker, men ikke kiosker og bensinstasjoner. Butikkene kommer fra OpenStreetMap, som lages av frivillige og kan mangle nye butikker.
- **Når ingen innen 3 km:** Det er ingen registrert dagligvarebutikk innen 3 km i luftlinje. En ny butikk kan mangle i OpenStreetMap.

### `pharmacy` — Nærmeste apotek
**Forklaring:** Avstanden er i luftlinje til nærmeste apotek. Apotekene kommer fra OpenStreetMap, som lages av frivillige og kan mangle noen.
- **Når ingen innen 5 km:** Det er ikke registrert noe apotek innen 5 km i luftlinje. OpenStreetMap kan mangle noen apotek.

### `doctor` — Nærmeste legekontor
**Forklaring:** Avstanden er i luftlinje til nærmeste legekontor eller legesenter med allmennleger, hentet fra OpenStreetMap. Hvilken fastlege man får, avhenger av ledige plasser hos legene, ikke av avstand.
- **Når ingen innen 5 km:** Det er ikke registrert noe legekontor innen 5 km i luftlinje. OpenStreetMap kan mangle noen kontorer.

## Natur og friluft

### `trails` — Nærmeste tursti eller skiløype
**Forklaring:** Avstanden er målt i luftlinje til nærmeste registrerte tursti, sykkelrute eller skiløype. Ikke alle stier og løyper er registrert, og skiløyper er bare preparert når det er snø.

### `protectedNature` — Nærmeste verneområde
**Forklaring:** Verneområder er natur som er vernet etter naturmangfoldloven, for eksempel naturreservater, landskapsvernområder og nasjonalparker. Avstanden er i luftlinje til nærmeste kant av området.
- **Når inne i verneområdet:** Adressen ligger inne i et verneområde. Der gjelder en egen verneforskrift, som kan begrense bygging og andre tiltak.

### `recreationArea` — Nærmeste sikra friluftsområde
**Forklaring:** Statlig sikra friluftsområder er strender, badeplasser, øyer, parker og skog som staten har sikret slik at alle kan bruke dem. Avstanden er i luftlinje, og mange andre turområder og parker er ikke med i denne listen.

## Område

### `municipality` — Kommune
**Forklaring:** Kommunen bestemmer blant annet byggesaker, skolekretser, barnehageplasser, kommunale avgifter og eventuell eiendomsskatt.

### `neighbourhood` — Nabolaget (grunnkrets)
**Forklaring:** En grunnkrets er SSBs minste område for statistikk, ofte et boligfelt eller noen kvartaler med noen hundre innbyggere. Tallet viser hvor mange som bor i grunnkretsen eiendommen ligger i, og hvor tett det bor folk.

### `neighbourhoodAge` — Aldersfordeling i nabolaget
**Forklaring:** Andelen barn og unge under 20 år og eldre over 70 år i grunnkretsen eiendommen ligger i. SSB skjuler aldersgrupper med bare 1–2 personer, så andelene kan være litt for lave.

### `population` — Folketall i kommunen
**Forklaring:** Antall innbyggere i hele kommunen per 1. januar. Tallet sier ikke hvor tett det bor folk akkurat rundt adressen.

### `medianIncome` — Medianinntekt etter skatt (husholdning)
**Forklaring:** Halvparten av husholdningene i kommunen har mer enn dette etter skatt, og halvparten har mindre. Inntektene kan variere mye mellom ulike deler av kommunen, særlig i Oslo.

### `areaIncome` — Medianinntekt i nærområdet (husholdning)
**Forklaring:** Halvparten av husholdningene i området har mer enn dette etter skatt, og halvparten har mindre. Området er SSBs delområde, en gruppe grunnkretser med noen tusen innbyggere (i Oslo ofte en del av en bydel), og kommunens tall står ved siden av.
- Der SSB ikke har tall for delområdet, vises bydelen eller kommunen.

### `housePrice` — Kvadratmeterpris i kommunen (selveier)
**Forklaring:** Gjennomsnittlig pris per kvadratmeter for selveierboliger som ble solgt i kommunen i løpet av året, for enebolig, småhus (som rekkehus og tomannsbolig) og blokkleilighet. Prisen kan være mye høyere eller lavere i ulike deler av kommunen og for den enkelte bolig.
- SSB viser ikke prisen for en boligtype når det ble solgt for få boliger av den typen. Borettslag er ikke med.

### `municipalFees` — Kommunale gebyrer (vann, avløp, renovasjon)
**Forklaring:** Hva kommunen tar i året for vann, avløp og avfall for en vanlig bolig, slik kommunen har meldt det til SSB (uten 25 % merverdiavgift). Dette er faste utgifter man har som eier, i tillegg til strøm og eventuelt eiendomsskatt.
- Gebyret kan være annerledes for din bolig, for eksempel med vannmåler, hytte eller egen septiktank. Feiing og tilsyn kommer i tillegg. I et borettslag eller sameie er gebyrene ofte en del av felleskostnadene.

### `propertyTax` — Eiendomsskatt på bolig
**Forklaring:** Om kommunen tar eiendomsskatt på boliger, og i så fall satsen i promille av boligens skattegrunnlag og et eventuelt bunnfradrag, slik kommunen har meldt det til SSB.
- Hvor mye en bolig betaler, avhenger av verdien kommunen setter på den. Med et høyt bunnfradrag, som i Oslo, betaler mange lite eller ingenting. Kommunen kan svare på hva skatten blir for en bestemt bolig.
- En kommune uten eiendomsskatt på bolig kan innføre den senere, og kan ha eiendomsskatt på næring eller kraftanlegg.

### `crimeRate` — Anmeldte lovbrudd i området
**Forklaring:** Antall lovbrudd som ble anmeldt der de skjedde, per 1000 innbyggere. I Oslo gjelder tallet bydelen (siste år) og sammenlignes med Oslo og landet; ellers gjelder det hele kommunen (snitt over to år) og sammenlignes med landet.
- **Når bydel i Oslo:** Bydeler med mye handel, uteliv og trafikk, som sentrumsbydelene, får flere anmeldelser enn folketallet tilsier. Tallet sier ikke hvor trygt det er akkurat i gata.
- **Når få bor der:** I Sentrum bydel bor det så få at et tall per 1000 innbyggere ikke gir mening, så vi viser antallet.
- **Når Gardermoen er med:** Lovbrudd på Oslo lufthavn Gardermoen, for eksempel smugling, blir talt med i Ullensaker og trekker tallet opp.
- Ikke alle lovbrudd blir anmeldt, og hvor mye politiet kontrollerer påvirker også tallet.

### `violentCrime` — Anmeldt vold i området
**Forklaring:** Antall anmeldte saker om vold og mishandling per 1000 innbyggere, i bydelen i Oslo og ellers i hele kommunen. Tallet tar også med vold i nære relasjoner og sier ikke hvor trygt det er akkurat i nabolaget.
- **Når få bor der:** I Sentrum bydel bor det så få at et tall per 1000 innbyggere ikke gir mening, så vi viser antallet.
- **Når Gardermoen er med:** Lovbrudd på Oslo lufthavn Gardermoen blir talt med i Ullensaker.

### `culturalHeritage` — Kulturminner innen 50 m
**Forklaring:** Kulturminner er spor etter menneskers liv og virke, for eksempel bygninger, gravhauger og fornminner, registrert av Riksantikvaren. Her vises kulturminner med vern innen 50 meter i luftlinje, det nærmeste først.
- **Når fredet:** Et fredet kulturminne er vernet etter kulturminneloven og kan ikke endres eller skades uten tillatelse. Automatisk fredete kulturminner har i tillegg en sikringssone på minst 5 meter rundt seg.
- **Når listeført eller regulert til bevaring:** Kulturminnet er ikke fredet, men kommunen eller staten mener det bør tas vare på. Det kan gi krav ved riving, ombygging og endring av fasader, og kommunen avgjør det i hver byggesak.
- **Når uavklart vernestatus:** Kulturminnet er registrert, men det er ikke avgjort hvilket vern det har. Kulturminnemyndighetene kan avklare det før man bygger eller graver.
- **Når ingen registrert:** Det er ikke registrert kulturminner med vern innen 50 meter. Det kan likevel finnes kulturminner som ikke er registrert, særlig under bakken.

---

## Ready for data points not added yet

The `ssb_kommuner` table also has these numbers (see `SOURCES.md`). If they become data points, use these texts.

### Aldersfordeling (`agePct0to17`, `agePct18to66`, `agePct67plus`)
**Forklaring:** Andelen av innbyggerne i kommunen som er barn (0–17 år), i arbeidsfør alder (18–66 år) og eldre (67 år og over).

### Boligtyper (`housingPct*`)
**Forklaring:** Hvor stor andel av boligene i kommunen som er eneboliger, tomannsboliger, rekkehus eller leiligheter i blokk.

### Utdanning (`educationPctHigher`)
**Forklaring:** Andelen av innbyggere over 16 år i kommunen som har fullført universitet eller høyskole.
