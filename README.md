# Wer ist der Impostor?

Partyspiel für 3 bis 20 Leute. Jeder öffnet die Website auf seinem eigenen Gerät. Einer erstellt einen Raum, die anderen treten mit dem 4-stelligen Code oder dem Einladungslink bei. Nach dem Start hält jeder den Knopf gedrückt und sieht seine Rolle: „Kein Impostor“ oder „Du bist der Impostor“. Der Server schickt jedem nur seine eigene Rolle.

Benötigt nur **Node.js 18 oder neuer**, keine weiteren Pakete.

## Variante 1: Auf deinem PC im WLAN

Gut, wenn alle im selben WLAN sind (z. B. zu Hause).

1. Node.js installieren: https://nodejs.org (LTS-Version)
2. Ordner entpacken, darin ein Terminal öffnen und starten:
   ```
   node server.js
   ```
3. Deine lokale IP-Adresse herausfinden:
   - Windows: `ipconfig` → „IPv4-Adresse“, z. B. `192.168.178.23`
   - macOS: Systemeinstellungen → WLAN → Details
4. Die anderen öffnen im Browser: `http://192.168.178.23:3000`

Fragt Windows nach der Firewall, erlaube den Zugriff im privaten Netzwerk.

## Variante 2: Kostenlos im Internet (z. B. Render)

Dann kann jeder von überall mitspielen.

1. Diesen Ordner in ein neues GitHub-Repository hochladen.
2. Auf https://render.com anmelden → **New → Web Service** → das Repository wählen.
3. Einstellungen:
   - Runtime: **Node**
   - Build Command: leer lassen (oder `npm install`)
   - Start Command: `npm start`
   - Instance Type: **Free**
4. Nach dem Deploy bekommst du eine URL wie `https://impostor-xyz.onrender.com`. Die schickst du deinen Freunden.

Hinweis zum Gratis-Tarif: Der Server schläft nach etwa 15 Minuten ohne Besucher ein. Der erste Aufruf dauert dann bis zu einer Minute. Beim Einschlafen gehen offene Räume verloren, einfach einen neuen erstellen.

Andere Anbieter, die Node.js können (Railway, Fly.io, ein eigener VPS), funktionieren genauso. Der Port wird über die Umgebungsvariable `PORT` gesetzt.

## Dateien

- `server.js`: Server mit Spiellogik und Live-Updates
- `public/index.html`: die Website
