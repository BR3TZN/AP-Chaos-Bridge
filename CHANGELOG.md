# AP Chaos Bridge 0.4.0

- Oberfläche geordnet: **Übersicht**, **Verbindungen**, **Spieler & Effekte**, **Regeln**, **Protokoll** und getrennte Seiten für **Stream-Alerts** und **Design**. Zusätzliche Namenslisten und DeathLink-Einstellungen stehen unter aufklappbaren Optionen. Die tatsächlichen Zielspieler werden automatisch aus eurem AP-Raum gelesen.
- Anmeldung unverändert: Eine TextOnly-Verbindung mit Adminrechten kann mehrere freigegebene Spieler im eigenen AP-Team mit Items und Hinweisen bedienen. Zusätzliche Bridge-Anmeldungen pro Spieler sind dafür nicht nötig.
- Geführte Regeln mit **Auslöser → Aktion → Empfänger** und Vorschau passender Spieler. **Nur Spieler dieses Spiels** filtert die tatsächliche Spielzuordnung verbundener AP-Slots.
- Zehn verständlich benannte Aktionen: zufällige Falle, Item ohne markierte Fallen, Item aus allen erlaubten, Item aus eigener Liste, bestimmtes Item, Hinweis, AP-Chatnachricht, reiner Stream-Alert, DeathLink und Zufall aus gewählten Aktionen. Im Zufallsmix hat jede aktuell mögliche gewählte Aktionsart dieselbe Chance. Freigaben und echte Raumkataloge begrenzen weiterhin alle Itemaktionen.
- Chatnachrichten erhalten einen festen Präfix, damit Text nicht als AP-Befehl ausgeführt wird. Hinweise gehen an das AP-Team des Zielspielers. DeathLink bleibt eine Gruppenaktion mit eigener Freigabe. Ein Run-Reset ist nicht enthalten.
- Optionaler Stream-Alert mit eingebauter Animation oder eigenem **GIF, PNG/APNG, WebP, WebM oder MP4** bis 10 MiB. Position, Größe, Dauer, Text und Einblendung sind pro Raum einstellbar. **Alert testen** verändert kein Spiel. OBS ist nur für die Anzeige im Stream nötig.
- Neutraler **Darkmode**, **Lightmode** und farbiges **Klassisch**-Design mit frei wählbarer Akzentfarbe, Kontrastanpassung und reduzierbaren Animationen. Das ursprüngliche Grün bleibt auswählbar; Design und Akzent werden für die gesamte Anwendung gespeichert.
- Einlesebericht gekürzt: erfolgreiche Spiele stehen im Vordergrund. Die drei bekannten Pakete ohne statisch lesbare World-Deklaration werden separat als **übersprungen** erklärt; kein irreführender Python-Hinweis mehr.
- **109 automatisierte Tests** für Regeln, UI-Formulare, Kontraste, Alerts, Import, Verbindungen und Updates. Der vollständige YAML-Bestand wurde erneut mit YAML 1.1 und PyYAML geprüft: **781 Varianten ohne Abweichungen**.

## Aktualisieren

In der bisherigen Version: **Einrichtung → Programmupdates → Nach Updates suchen → Update herunterladen → Installieren & neu starten**. Ab 0.4.0 heißt die Seite **Einstellungen**. Das Repository ist öffentlich; ein GitHub-Token ist nicht nötig.

Alternativ **AP-Chaos-Bridge-v0.4.0.zip** vollständig entpacken, Bridge beenden und Programmdateien ersetzen; **data beibehalten**. Node.js 22 oder neuer bleibt erforderlich. Räume, Regeln, Zugangsdaten und eigene APworlds bleiben erhalten. Die Bridge startet im Testmodus und pausiert.

**Prüfgrenze:** Formularabläufe sind mit JSDOM und der lokalen API geprüft; kein zusätzlicher interaktiver Chromium-Durchlauf. Keine echten Twitch-Ereignisse, Spenden oder Spieleffekte ausgelöst. Die YAML-Prüfung ist keine vollständige Seed- oder ROM-Generierung für sämtliche Spiele. Unbekannte APworld-Versionen benötigen für die statische Analyse Python ab 3.10; vorbereitete bekannte Dateiversionen funktionieren ohne Python.
