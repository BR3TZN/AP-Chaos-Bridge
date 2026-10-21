# Prüfung der Version 0.2.0

Stand: 21.10.2026. Ausgeführt unter Linux mit Node.js 24.19.0 und Python 3.12. Die Anwendung benötigt Node.js ab 22, die zusätzliche APworld-Analyse Python ab 3.10.

## Automatisierte Prüfungen

**58 Tests** über `npm test`. Sie führen die echten Module, den HTTP-Server, die tatsächlichen Formularhandler und lokale WebSocket-Gegenstellen aus.

| Bereich | Prüfumfang |
| --- | --- |
| Bisheriger Ablauf | YAML-Import, Netto-Cent, Aktionsfilter, deduplizierte Ereignisse, Limits, Cooldowns, Pause, Ablauf, Notaus und persistierte Aufträge |
| Archipelago | TextOnly-Handshake, Raumkatalog, Admin-Anmeldung, exakte Itembestätigung, Fehler und Seed-Bindung |
| Zufallsaktionen | Hilfreiche Items und Fallen aus erlaubtem Katalog, separater Fallenpool, mehrere ausgewählte Spieler, optionale separat freigegebene DeathLink-Gruppe |
| Räume | Getrennte Regeln, Spielerprofile, Ereignisse und Zugangsdaten; Wechsel und Wiederherstellung nach Neustart |
| Verbindungen | Maskierte Passwörter, verschlüsselte Speicherung, automatischer AP-Verbindungsaufbau mit gespeicherten Daten nach Neustart |
| Serveradressen | Lokal, archipelago.gg und frei eingetragener Host; Portgrenzen und TLS |
| Twitch OAuth | Rückleitung mit Cross-Site-Navigation, weiterhin gesperrte fremde API-Zugriffe, geprüfter State, Code-Austausch, Refresh Token und Replay-Abweisung |
| Twitch Tokenwechsel | Erneuerung abgelaufener Tokens, rotierender Refresh Token, bewusst getrennter manueller Tokenwechsel und Vergessen der Anmeldung |
| APworld | ZIP-Prüfsummen und Pfadprüfung; AST-Auswertung von Choice, Toggle, Range und Dictionaries; unbekannte dynamische Angaben; kein Ausführen von World-Code |
| YAML-Editor | Bestehende gewichtete Werte bleiben erhalten; getrennte Dateien pro Spieler; Spielervalidierung; Zusatzoptionen; HTTP-Download als ZIP |
| Oberfläche | Regel neu anlegen und bearbeiten; Serverfehler im Dialog; Katalogsuche, Spiel-Unterseite und Mehrspieler-Vorschau; Räume und Profile; gespeicherte Passwortmasken |

`npm run check` prüft JavaScript-Syntax, JSON-Dateien, lokale HTML-Assets und vorhandene Laufzeitabhängigkeiten. Der Paket-Audit meldet zum Prüfzeitpunkt keine bekannten Schwachstellen in den Laufzeitabhängigkeiten. Die Laufzeitpakete bleiben auf `ws` 8.22.0 und `yaml` 2.9.1 festgeschrieben.

## Prüfung im Browser

Zusätzlich in einem echten Chromium-Browser ausgeführt:

- Quellenformular mit lokalen und externen Adressen und maskierten gespeicherten Passwörtern.
- Suche im Spielekatalog und Öffnen der Stardew-Einstellungsseite.
- APworld-Import über den Dateidialog; tatsächliche Felder für Choice, Range und DeathLink.
- Einstellungen ändern und speichern; Vorschau für zwei Spieler.
- ZIP-Download aus der Oberfläche; beide enthaltenen YAMLs anschließend eingelesen und Werte geprüft.
- Raum anlegen und wechseln; mehrere Spielerprofile speichern.
- Gemischte Zufallsregel mit zwei ausgewählten Zielslots speichern.
- Mobile Oberfläche bei 390 Pixel Breite auf horizontalen Überlauf geprüft.
- OAuth-Abschlussseite; sensible URL-Fragmente werden aus der Adresse entfernt.

Bei diesem Ablauf wurden keine JavaScript-Laufzeitfehler im Browser gemeldet. Die Layouts der Quellen, des Editors und des mobilen Katalogs wurden zusätzlich visuell geprüft.

## APworld-Abgleich

Der AST-Parser wurde zusätzlich gegen die originalen World- und Options-Deklarationen von **Kingdom Hearts 2** und **Factorio** aus Archipelago **0.6.8** ausgeführt. Beide liefern in dieser Prüfung 46 Felder einschließlich allgemeiner Optionen, ohne nicht aufgelöste Felder. Der Test importiert die World-Module nicht und startet keine Spiele.

Der Generator ist eine Vorlage für die anschließende Archipelago-Generierung. Nicht statisch auflösbare Angaben anderer APworlds werden sichtbar ausgewiesen; eine universelle Auswertung beliebigen Python-Codes wird nicht behauptet. Die mitgelieferten YAMLs für KH2, Factorio und Stardew bleiben als Vorlagen erhalten.

## Prüfgrenzen

- Die Twitch-Gegenstelle und Token-Antworten der automatisierten Tests sind lokal simuliert. Es wurde keine Anmeldung im echten Twitch-Konto des Nutzers durchgeführt.
- Es wurde kein echter AP-Raum mit laufendem Spielclient verbunden. Ein zusätzlicher Itemversand ist am Server prüfbar; die Wirkung im konkreten Spiel hängt von dessen Client und Version ab.
- Die Charity-Ereignisse sind gegen das dokumentierte Pusher-Protokoll geprüft. Echte Spenden und eine Anmeldung im Charity-Dashboard wurden hier nicht ausgelöst.
- Windows-Startdateien und die Erkennung `py -3` sind enthalten; diese Ausführung erfolgte unter Linux.
- Die Referenzliste mit 867 Spielen beschreibt deren AP-Integrationsstatus. Sie ist kein Nachweis für 867 geprüfte Spieleffekte.

Quellen: [Twitch OAuth](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/), [Token-Erneuerung](https://dev.twitch.tv/docs/authentication/refresh-tokens/), [Charity API](https://streamer.make-a-wish.at/api), [Archipelago 0.6.8](https://github.com/ArchipelagoMW/Archipelago/tree/0.6.8).
