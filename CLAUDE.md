# projectone web

Web značky projectone (weby, e-shopy, vizuální identita, automatizace). Pracují na něm tři lidé, každý přes svůj Claude Code, většinou z claude.ai/code. Tahle pravidla platí pro každého Clauda v tomhle repu.

## Kde web běží

- Živě: https://plecitykuba4-bot.github.io/projectone-web/
- Nasazuje GitHub Pages z větve `main`. Co se spojí do `main`, je do minuty až dvou venku. Nic dalšího se nespouští, build neexistuje.

## Jak je web poskládaný

Celý web je jeden soubor `index.html`. Obsahuje všechno HTML, CSS i JS a je to jediný zdroj pravdy.

- `<style>` nahoře: CSS rozdělené komentáři podle sekcí (`/* NAV */`, `/* HERO */`, `/* SLUŽBY */`…), pak `/* ŽIVOT */` (stavy a interakce), `/* MOBIL A TABLET */` a `/* ANALÝZA VE 3D */`.
- `<body>`: `nav`, pak sekce `#hero`, `#analyza`, `#pristup`, `#sluzby`, `#prubeh`, `#proc`, `#cena`, `#faq`, `#kontakt` a `footer`.
- Tři `<script type="module">` na konci:
  1. animace při scrollu (Motion z CDN),
  2. `ŽIVOT`: funkční interakce (navigace, karty, časová osa, FAQ, kalkulace),
  3. `ANALÝZA VE 3D`: Three.js scéna řízená scrollem a fyzikou.
- Knihovny se berou z CDN přes importmap. Nic se neinstaluje, `npm` tu není.

`parts/` obsahuje starší pracovní kopie analýzy, které už jsou vložené v `index.html`. **Needituj je.** Změna v nich se na web nedostane. Všechno se upravuje přímo v `index.html`.

## Práce ve třech: pravidla proti konfliktům

1. **Nikdy necommituj přímo do `main`.** Každá práce má vlastní větev `jmeno/co-delam`, třeba `kuba/hero-nadpis` nebo `pepa/kontakt-formular`. Do `main` se dostane jen přes Pull Request.
2. **Začni z čerstvého `main`.** Před začátkem práce udělej `git pull` na `main`, ať nestavíš na staré verzi.
3. **Sahej jen na svou sekci.** Upravuj HTML své sekce a její blok v CSS a JS. Když potřebuješ změnit něco sdíleného (paletu, `nav`, `ŽIVOT`, `MOBIL A TABLET`, globální styly), napiš to do popisu PR, ať o tom ostatní vědí.
4. **Nové CSS pravidlo dej do bloku své sekce.** Nepřepisuj sdílená pravidla, raději přidej konkrétnější.
5. **Nikdy nepřeformátovávej celý soubor.** Žádný Prettier, žádné přeskládání odsazení, žádné „uklizení“ kódu, o které nikdo nežádal. Jeden přeformátovaný řádek navíc = konflikt u všech ostatních.
6. **Malé PR.** Jedna věc = jeden PR. Čím dřív se to spojí, tím míň konfliktů.
7. **Když Git hlásí konflikt,** vyřeš ho tak, aby zůstaly změny obou stran. Nikdy jen nepřepiš cizí práci svojí verzí. Když si nejsi jistý, zeptej se člověka.

## Než otevřeš PR, ověř

- Web se otevře bez chyb v konzoli (stačí otevřít `index.html` v prohlížeči nebo spustit `npx serve .`).
- Sekce vypadá dobře na šířce 1440 px i na mobilu (375 px).
- Animace fungují i s `prefers-reduced-motion`: obsah musí být vidět i bez nich.
- V popisu PR napiš česky, co se změnilo a kterých sekcí se to týká.

## Styl webu

- Paleta Golden Twilight: `#000814`, `#001D3D`, `#003566`, `#FFC300`, `#FFD60A`. Nové barvy nepřidávej bez domluvy. Žádná růžová.
- Písma: Cabinet Grotesk (nadpisy) a Switzer (text) z Fontshare.
- Animuj jen `transform` a `opacity`. Každá akce musí jít spustit i klikem a klávesnicí, hover je jen doplněk.
- Žádné kreslené SVG ilustrace. Web má působit moderně a prémiově.
- Texty jsou česky a návštěvníkovi se vyká („potřebujete“, „napište nám“). Piš věcně a bez marketingových frází.
- Commit zprávy piš česky a krátce, co a proč.
