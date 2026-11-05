# Ellenőrzési jegyzőkönyv

Dátum: 2026. november 5. Helyi időzóna: Europe/Budapest. Node.js 22.14.0.

## Automatizált ellenőrzések

- `npm test`: 60 teszt. Üzleti szabályok, időbeli kiosztás, hitelkeret, számlázási lánc, valódi XLSX-olvasás, munkatér-elkülönítés, szerepkörök, privát fájlok, jelszó és munkamenet, jóváhagyott beszerzések védelme, cégtörzs, mentési versenyhelyzetek és üzemeltetői CLI-k.
- `npx tsc --noEmit`: sikeres.
- `npm run lint`: sikeres.
- `npm run build`: sikeres production build.
- `npm audit --omit=dev --audit-level=moderate`: 0 sérülékenység.
- `git diff --check`: sikeres.

A fejlesztői függőségek auditja 8 mérsékelt, a typescript-eslint/minimatch lánchoz tartozó jelzést tartalmaz. Automatikus, főverziót váltó javítás nem történt.

## Böngészős próbák

Az ellenőrzés külön `/tmp` alatti SQLite-adatbázissal és csak localhoston futó production példánnyal történt. A kipróbáláshoz használt fiókok és jelszavak nem részei az alkalmazás alapadatainak.

1. Bejelentkezés, kijelentkezés, új munkatér és saját cégnév megjelenítése.
2. Nyolclépéses fuvarfelvétel: partner és hitelkeret, rakodási adatok, díj, kamionból töltött sofőr/pótkocsi/előző hely, valós PDF kiválasztása, visszaigazolás és sikeresen visszaigazolt központi mentés.
3. Elmentett fuvar megnyitása és módosítása: a módosított megjegyzés a szerver válasza után jelenik meg a részletekben.
4. Valódi XLSX-fájl kiválasztása, első munkalap beolvasása, üzleti ellenőrzés és táblázatos előnézet, atomikus import, majd az új köteg visszavonása. A fuvarszám 9 → 10 → 9, a központi revízió minden mentésnél nőtt.
5. Mintaadat nélküli második ügyfélmunkatér: saját cég, üres flotta és használható kezdő állapot; első sofőr mentése, majd a járműfelvétel elérhetővé válása. Másik munkatér fuvarjai nem láthatók.
6. Dashboard 390 × 844-es mobilnézetben. A javítás után a dokumentum szélessége és a viewport egyaránt 390 px; nincs oldalirányú oldaltúlcsordulás.
7. Dashboard, integrációs központ, fuvarfelvétel és diszpécseri időterv vizuális ellenőrzése. A diszpécseri kártyák az időterv sávjában olvashatók; mobilon a kapacitástábla belül görgethető.

A képernyőképek az `output/` könyvtárban, bemutató- és tesztadatokkal készültek.

## Nem igazolt külső feltételek

Szolgáltatói kulcsok hiányában nem történt éles HERE/Google/SAP-kérés; az adapterek szerződéseit mockolt válaszokkal teszteltük. A scanR, Transporeon, project44, SMTP, AI és tachográf szolgáltatás nincs élesítve. A Docker image futtatása nem volt ellenőrizhető, mert a helyi gépen nincs Docker CLI. Nem történt nyilvános telepítés vagy GitHub-push.

A részletes megvalósítási határok a [követelménymátrixban](requirements-coverage.md) és az [integrációs leírásban](integrations.md) szerepelnek.
