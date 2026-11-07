# Avviklede funksjoner

Funksjoner vi har skrudd av eller tatt bort. Koden slik den var, ligger på branchen **`avviklede-funksjoner`**
(laget fra `main` mens alt fortsatt virket), så ingenting er tapt. Legg til en linje her når noe skrus av.

| Funksjon | Skrudd av | Hvor | Slik slår du den på igjen |
|---|---|---|---|
| **«Spør megleren»** (sjekkliste med spørsmål til visning på adressesiden) | 2026-11-07, Erik | `web/src/app/checklist.ts` (visning), `api/src/questions.ts` (spørsmålene) | Sett `SHOW_CHECKLIST = true` i `web/src/app/address.ts`. |

Merk: «Spør megleren» er bare skrudd av på adressesiden. API-et lager fortsatt spørsmålene (`profile.questions`),
og PDF-rapporten (`api/src/report.ts`, Lukas) viser dem fortsatt under «Spørsmål å stille».
