# Suggestions

Ideas and problems to discuss as a team. Add your own under a new heading.

## 1. Averages hide serious risks (Erik)

**Problem.** `PLAN.md` says "Overall = weighted average". A single serious problem gets averaged away by the categories that are fine.

Example from the UI sketch (invented numbers): an address inside a **high** quick clay hazard zone gets 22 on ground, but 66–86 on everything else. The weighted average comes out at **62, "Good"**. A homebuyer would read that as safe, when this is the single most important fact about the property.

The same thing happens at category level: one critical finding, like a flood zone, is outweighed by two harmless ones.

**Two sides of the same problem:**
- **Overrepresented averages:** many ordinary, positive data points (a bus stop nearby, a school, a park) add up and dominate the score.
- **Underrepresented problems:** rare but serious findings (quick clay, flood, landslide, high radon, polluted ground) count as just one data point among many, so they barely move the overall number.

**Suggested fixes (pick one or combine):**
1. **Severity caps.** A high-severity finding caps the score. Example: a high hazard caps its category at 30 and the overall at 40; a medium one caps the overall at 60. It's simple to explain: "Capped because of quick clay."
2. **Worst category first.** Always show the weakest category next to the overall score, e.g. "62 overall, but Ground & geology is 22." The number is never shown alone.
3. **Penalty instead of average.** Start from the average, then subtract a fixed penalty per high or medium warning.
4. **Hazards as a gate, not a score.** Ground and hazards decide a pass/warn/fail label shown above the score. The score only covers everyday quality (location, nature, area).

**Recommendation:** combine 1 and 2. Caps keep the number honest, and showing the worst category explains it. Both are easy to build and easy to show in the demo (Even's test address #1 against #4).

**Also make sure:**
- The reason for a cap is always shown in plain words, with the source.
- Warnings come from the data, never from the AI summary (see `docs/PROFILE.md`).
- Missing data never counts as "good". A category we can't rate is left out of the average and shown as such, so a missing hazard dataset can't make an address look safer than it is.

Decision owner: Lukas (rating).
