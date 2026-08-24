# E36 United — content fix 2 (2026-08-24)

## O nás
- opraveno překrývání textu fotografiemi v timeline
- odstraněna kombinace `min-height` + `aspect-ratio`, která nutila fotku přetékat přes grid
- doplněn bezpečný responsive fallback; při užším desktopu se text a fotografie skládají pod sebe

## United Merch
- hlavní U logo je výrazně větší
- jeho výška nyní vizuálně odpovídá levému hero bloku od `United Goods / Shop Beta` po CTA tlačítka
- mobilní breakpointy zůstávají samostatně omezené

## Weekend Builder
- přidán krok `Kdy chceš odjet?`
- páteční příjezd: odjezd Sobota / Neděle
- sobotní příjezd: automaticky Neděle
- `Jen na otočku`: odjezd i ubytování se skryjí
- počet nocí se dopočítává automaticky a používá se v ceně ubytování
- Live Summary a finální rekapitulace zobrazují příjezd → odjezd + počet nocí
- odjezd a počet nocí se přenesou do Můj United handoffu

### Poznámka k backendu
Současná D1 rezervace má pouze tři `attendanceType` hodnoty (`full_weekend`, `saturday_only`, `day_visit`).
Aby se informace o pátečním příjezdu + sobotním odjezdu neztratila bez databázové migrace, Můj United ji při převzetí planneru vloží viditelně do pole Poznámka jako `[Weekend Planner] Odjezd: ...`.
Samostatný databázový sloupec pro odjezd lze doplnit později při backendové úpravě.
