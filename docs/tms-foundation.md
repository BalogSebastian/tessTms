# tessTMS – megvalósított alaparchitektúra

## Termék és központi folyamat

A rendszer központi üzleti egysége a fuvarmegbízás. Ehhez kapcsolódnak a megállók, árumozgások, díj és költség, jármű/sofőr, dokumentum, számlaelőkészítés és eseményelőzmény. Az adatokat a modulok közös munkatérből olvassák; nincs különálló, egymástól független modulonkénti mintaadatbázis.

A [követelménymátrix](requirements-coverage.md) rögzíti a két PDF tényleges lefedettségét. A jelen dokumentum a megvalósított architektúrát írja le, a következő fejlesztéseket külön jelöli.

## Rétegek

| Réteg         | Megvalósítás                                                                                                                                                                                 |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Felület       | Magyar nyelvű, reszponzív Next.js App Router / React / TypeScript alkalmazás, modulonkénti URL-lel.                                                                                          |
| Kliensállapot | Hitelesítés után szerverről betöltött munkatér. Mentéskor optimista frissítés, hiba esetén visszaállítás és látható értesítés. A kritikus fuvarrögzítés megvárja a szerver sikeres válaszát. |
| API           | Node.js route handlerek, hitelesített munkamenet, origin-ellenőrzés, szigorú Zod payload-validálás és szerepkör-ellenőrzés.                                                                  |
| Tartomány     | Közös `lib/tms` típusok és üzleti szabályok, amelyeket a szerver újra alkalmaz.                                                                                                              |
| Adattár       | Beépített `node:sqlite`, WAL mód, tranzakció és revízió. A munkatér állapota jelenleg egy JSON-rekord.                                                                                       |
| Fájl          | Munkatérhez rendelt SQLite BLOB és metaadat; csak hitelesített letöltéssel.                                                                                                                  |
| Integráció    | Szerveroldali szolgáltatói adapterek; a titkok egy kifejezetten kijelölt munkatérhez kötött környezeti változók.                                                                             |

## Munkatér és hozzáférés

Minden független ügyfél saját workspace-rekordot kap. A felhasználó munkaterét a szerver a munkamenetből határozza meg; a kliens nem választhatja meg tetszőleges tenant-azonosító beküldésével. Az állapot, a felhasználólista, az audit és a fájlok lekérdezése ezen a határon belül történik.

A négy jelenlegi szerepkör:

| Szerepkör    | Működés                                                                                                                                               |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `admin`      | Minden jelenlegi üzleti modul, felhasználókezelés és integrációs kapcsolatteszt.                                                                      |
| `dispatcher` | Operatív fuvar-, erőforrás-, dokumentum-, útvonal-, készlet-, szerviz- és incidensműveletek; nincs pénzügyi számlajóváhagyás vagy felhasználókezelés. |
| `finance`    | Partner/pénzügyi adatok, dokumentum, költség, beszerzés, számlaelőkészítés és outbox. A fuvar operatív adatait nem írhatja át.                        |
| `viewer`     | A munkatér olvasása, módosítás nélkül.                                                                                                                |

A munkatéren belüli olvasás nem mezőszinten korlátozott. A cégszűrő megjelenítési szűrő. Külön ügyfeleket ezért önálló munkatérbe kell tenni; partnernek vagy sofőrnek nem elegendő a jelenlegi belső nézetet átadni.

A cégtörzs munkatérhez tartozik. Az adminisztrátor céget adhat hozzá és átnevezhet; az azonosító stabil, a korábbi rekordkapcsolatok megmaradnak. Új, mintaadat nélküli munkatér a saját nevéből létrehozott céggel indul. A szerver ellenőrzi a céghivatkozásokat. Telephely-, szerződés- és díjtáblatörzs általános ügyfélkonfigurációja még szükséges.

## Hitelesítés

Az első adminisztrátor saját névvel, e-maillel és legalább 12 karakteres jelszóval készül. A jelszavak külön sóval scrypt-hashként tárolódnak. A munkamenet véletlen tokenje HttpOnly sütiben van; az adatbázis a token hashét és lejáratát tartalmazza. A bejelentkezési hibák korlátozottak, a kijelentkezés a szerveroldali munkamenetet érvényteleníti. Az adminisztrátor szerepkört módosíthat és fiókot tilthat le; a változás visszavonja az érintett munkameneteket, az utolsó aktív adminisztrátor védett. Saját jelszócsere a jelenlegi jelszó ellenőrzésével működik, a korábbi munkamenetek visszavonásával.

A környezet HTTPS URL-je alapján Secure süti készül. A módosító kérések saját origint igényelnek. SSO, MFA és e-mailes jelszó-visszaállítás nem része ennek a kiadásnak.

## Tranzakció, konkurencia és üzleti ellenőrzés

A kliens az aktuális teljes munkatérre vonatkozó revíziót küldi. A szerver `BEGIN IMMEDIATE` tranzakcióban ellenőrzi a revíziót, szerepkört és módosításokat. Elfogadáskor nő a revízió és audit-esemény készül. Elavult revízió 409 választ eredményez; a kliens frissít, a felhasználó az új állapoton ismételheti a műveletet.

A szerver többek között újraellenőrzi:

- megbízásszám, partner, számértékek, rakodási adatok és hitelkeret;
- státuszátmenetek, erőforrás-ütközés, raksúly/ADR, műszaki és szerviz;
- létező feltöltött fájl a dokumentum új verziójához;
- számlaelőkészítés partner/deviza/cég/összeg egyezése és duplázásvédelme;
- beszerzési állapotok, jóváhagyási szerepkör;
- korábbi készletmozgások megőrzése és a készletegyenleg;
- kapcsolódó rekordok létezése.

Ez a megoldás egyszerű és konzisztens egy kezdeti telepítésben. Teljes munkatér-pillanatképet küld, ezért nagy adatmennyiséghez műveletszintű parancsok és normalizált, indexelt táblák szükségesek. A jelenlegi megoldás nem PostgreSQL RLS-t használ: az izolációt a repository lekérdezései és az API beléptetése végzik.

## Audit és fájlok

Az audit szereplőjét a szerver állítja elő a hitelesített felhasználóból, a kliens auditlistáját nem fogadja el hiteles forrásként. A `audit_events` táblán SQLite-triggerek tiltják az UPDATE/DELETE műveletet. A normál alkalmazásműveletek így utólag nem írják át a korábbi eseményeket.

Ez nem külső, megváltoztathatatlan bizonyítéktár. A privilegizált adatbázis-üzemeltető módosíthatja a sémát, a backupból történő visszaállítás pedig visszagörgeti az auditot is. Szabályozott megőrzéshez külön integritás- és archiválási megoldás kell.

A fájlok munkatérhez kötött azonosítóval, névvel, MIME-típussal és bájtokkal tárolódnak. A jelenlegi limit 20 MB/fájl; a tár a típuslistát és méretet ellenőrzi. Kártevővizsgálat, tartalomszignatúra-ellenőrzés, objektumtár, kvóta és árvafájl-takarítás még fejlesztendő. A lemez titkosítása a telepítési környezet feladata.

## Integrációs állapot

HERE és Google útvonalszámító adapter létezik; a kulcs és jogosultság ügyféltől/szolgáltatótól szükséges. SAP Service Layer belépés/metadata/logout kapcsolatteszt létezik, üzleti feladás még nincs. Webhook esetén csak HEAD elérhetőségi teszt van. scanR, Transporeon, project44 és SMTP adapterhez szerződés és további implementáció kell.

A routeR és Tess jelenleg magyarázható, szabályalapú munkatérfunkció. Nem fut mögöttük nyelvimodell vagy általános útvonal-optimalizáló. A részleteket az [integrációs dokumentáció](integrations.md) tartalmazza.

## Következő kiadási kapuk

| Terület                  | Következő konkrét eredmény                                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Ügyfélkonfiguráció       | A megvalósított cégtörzs mellett általános üzletág-, telephely-, szerződés- és díjtáblatörzs, ügyfélre szabott migráció. |
| Adathatókör és identitás | Cég-/partner-/sofőrjogosultság, SSO/MFA, meghívási folyamat és elfelejtett jelszó helyreállítása.                        |
| Operáció                 | Teljes időablak/AETR kapcsolat, külön sofőrmobil, alvállalkozók, telematika és értesítés.                                |
| Pénzügy                  | Jóváhagyott számlázási profil, helyesbítő/részteljesítési lánc, SAP üzleti mapping és ellenőrzött feladás.               |
| Skálázás                 | Normalizált adatmodell, műveleti API, indexek, terhelésmérés, külső objektumtár.                                         |
| Megbízhatóság            | Ütemezett mentés, visszaállítási próba, megfigyelhetőség, megőrzés/törlés, független auditarchívum.                      |
| Elfogadás                | Két PDF-re visszavezetett ügyfél-UAT, próbaüzem és szolgáltatónként éles kapcsolati teszt.                               |

A [telepítési útmutató](deployment.md) tartalmazza a jelenleg működő önálló Node/Docker indítást, backupot és munkatér-provisionálást.
