# Shane Dead Redemption

Een western in PS1-stijl in de browser. Shane heeft twee frikandelbroodjes gestolen bij de Plus
General Store in Hatert Town. Nu staat er een premie op zijn hoofd en moet hij het land uit vluchten,
naar de grens bij Kleve.

Speel: https://shanedeadredemption.timvanbergen.nl

- 20 hoofdstukken in 4 aktes, met duels, bazen, ritten te paard, op de trein, de wagen en de stoomboot
- Third-person camera over de schouder, Dead Eye, dekking door te bukken
- Wapens: revolver, lever-action, shotgun, dynamiet en mes

Besturing: WASD, muis, rechtermuis = richten, Q = Dead Eye, C = bukken, R = herladen, 1–5 = wapen.

Techniek: three.js zonder build-stap, met een eigen PS1-renderer (vertex snapping, affiene textures,
15-bit kleur met dither). Alle geluid en muziek worden live gemaakt met WebAudio.
Deploy: `npx wrangler deploy` (Cloudflare Workers met statische assets).
