# AP Chaos Bridge 0.3.1 · Einrichtung

## Start und Update

1. ZIP vollständig entpacken. Für ein Update die neue Version über den bisherigen Programmordner kopieren und **`data` beibehalten**. Die laufende Bridge vorher unter Einrichtung beenden.
2. [Node.js 22 oder neuer](https://nodejs.org/en/download) installieren. Die npm-Pakete liegen bereits bei.
3. `Start.cmd` öffnen. Oberfläche: **http://127.0.0.1:17381**. Nach einem Update mit Strg+F5 neu laden.
4. Für das Einlesen neuer `.apworld`-Dateien zusätzlich [Python 3.10 oder neuer](https://www.python.org/downloads/windows/) installieren und bei der Installation zu PATH hinzufügen. Bereits vorhandenes Python wird über `py -3`, `python` oder `python3` erkannt. Anschließend die Bridge neu starten.

## Räume und mehrere Spieler

1. Unter **Räume → Raum anlegen** z. B. „Stardew Charity“ oder „Factorio Run“ anlegen.
2. Oben im Raum-Menü wechseln. Regeln, Zugangsdaten und Protokolle sind pro Raum getrennt.
3. Unter **Spielslots → + Spieler** einen Namen pro Zeile eintragen:

```text
Br3tzn | Stardew Valley
Spieler2 | Factorio
Spieler3 | Stardew Valley
```

Slotnamen: eindeutig, maximal 16 Zeichen. Der Spieltitel ist optional. Tatsächliche Zielslots liest die Bridge später aus dem erzeugten AP-Raum; diese Namensliste allein fügt einem laufenden Seed keine Spieler hinzu.

## APworlds und YAML-Editor

Viele direkt verfügbare APworlds sind bereits enthalten und vorbereitet. Die **[Liste manueller Downloads](APWORLDS-MANUELL.md)** nennt fehlende Dateien und teilweise dynamische Einstellungen. Die Unterordner des APworld-Ordners werden mit eingelesen; YAML-Vorlagen werden dort ignoriert.

1. `.apworld`-Dateien mit Originalnamen in den Ordner **`apworlds`** neben `Start.cmd` kopieren. Alternativ im Spielekatalog über **APworld hinzufügen** mehrere Dateien auswählen.
2. Unter **Spielekatalog → Ordner neu einlesen** aktualisieren. Ein anderer Ordner kann dort eingetragen werden.
3. Spiel suchen und **Einstellungen & YAML** öffnen.
4. Einstellungen setzen und Slotnamen eintragen, ein Name pro Zeile. **Gespeicherte Spielernamen übernehmen** füllt die zum Spiel passenden Profile ein.
5. **Einstellungen speichern** behält die Vorlage in diesem Raum. **YAML-Vorschau** zeigt den Export. **YAMLs herunterladen** erzeugt eine einzelne YAML oder ein ZIP mit einer Datei pro Spieler.
6. Die Dateien anschließend mit der passenden APworld-Version in Archipelago zum Seed generieren. Die Bridge verändert durch den YAML-Export keinen bereits laufenden Seed.

Die Formularfelder basieren auf den deklarierten APworld-Optionen. Dynamische Angaben werden auf der Spielseite aufgelistet. Für solche Worlds die fehlenden Angaben bei **Erweiterte Zusatzoptionen als YAML** setzen. Diese Zusatzoptionen überschreiben gleichnamige Formularfelder. APworld-Code wird beim Einlesen nicht ausgeführt.

## Archipelago-Raum verbinden

Unter **Quellen → Archipelago-Raum**:

| Hosting | Eingabe |
| --- | --- |
| Lokal · dieser PC | Raumport; Host ist automatisch `127.0.0.1` |
| Extern · archipelago.gg | Raumport; Host ist automatisch `archipelago.gg` |
| Extern · eigener Host / IP | Hostname oder IP und Raumport |

Dann einen **bereits existierenden Slotnamen** wählen. Raumpasswort eintragen, falls gesetzt. Das **Server-Adminpasswort** ist separat und wird für zusätzliche Items benötigt. Der Host muss dafür `server_password` setzen. **Raum verbinden** klicken.

„AP verbunden“ und „Admin angemeldet“ sind getrennte Statusanzeigen. Passwörter bleiben maskiert im Formular und werden lokal gemerkt. Die Bridge meldet sich als zusätzlicher TextOnly-Client an; eure Spielclients bleiben weiterhin geöffnet. Ein solcher Bridge-Client kann mehrere freigegebene Zielslots im eigenen Team bedienen.

## Twitch verbinden

1. [Twitch Developer Console](https://dev.twitch.tv/console/apps) öffnen und eine Anwendung registrieren.
2. OAuth Redirect URL exakt **`http://localhost:17381/oauth/callback`** eintragen. Anwendungstyp **Confidential**. Bei einem anderen Bridge-Port die Redirect-URL entsprechend ändern.
3. Unter **Quellen → Twitch EventSub** die **Client-ID** eintragen.
4. Für automatische Token-Erneuerung in Twitch ein **Client Secret** erstellen und zusätzlich eintragen. Ohne Secret funktioniert die Anmeldung ebenfalls; nach Ablauf des gespeicherten Tokens ist eine erneute Anmeldung nötig.
5. Gewünschte Ereignisse auswählen. Die Broadcaster-ID kann leer bleiben; sie wird aus dem Token erkannt.
6. **Mit Twitch anmelden** klicken und mit dem Twitch-Kanal anmelden, dessen Ereignisse die Bridge auslösen sollen. Berechtigungen bestätigen.
7. Die Rückleitung meldet die übernommene Anmeldung. Das Anmeldefenster schließen; in der Bridge steht bei Twitch **Verbunden**. Fehlende Berechtigungen erscheinen direkt unter dem Status.

| Ereignisse | Twitch-Berechtigung |
| --- | --- |
| Subs, Resubs, Gift Subs | `channel:read:subscriptions` |
| Bits | `bits:read` |
| Kanalpunkte | `channel:read:redemptions` |

Die in 0.1.1 blockierte Rückleitung von Twitch ist behoben. Zugangsdaten werden lokal gespeichert; mit Client Secret wird ein Refresh Token für die Erneuerung genutzt. Nach Widerruf einer Anmeldung ist erneut zu autorisieren.

## Charity Royale

1. Unter **Quellen → Charity Royale** nur deinen Slug, z. B. **`br3tzn`**, eintragen; keine vollständige JSON-Adresse.
2. Projekt **`charityroyale2026`**. **Spenden verbinden** klicken.
3. In der Regel die genaue Aktion des Spendenbuttons eintragen. Ein Test mit `metadata.action: trap` braucht `trap`, nicht `random-trap`.
4. Der Netto-Betrag wird in Cent ausgewertet: `amount_net: 1000` entspricht 10 Euro.
5. Offizielle Testspenden bzw. `id: null` werden als Simulation verarbeitet. Die Bridge filtert nach dem Streamer-Slug; eine noch fehlende öffentliche JSON-Seite verhindert solche Testereignisse nicht.

## Zufallsaktionen und mehrere Ziele

1. Unter **Spielslots → Effekte & Freigabe** den Slot aktivieren und erlaubte Items auswählen.
2. **Erlaubt** ist der Pool für gezielte und gemischte Zufallsitems. **Zufall** ist der zusätzliche Fallenpool. Für den gesamten Katalog gibt es **Alle Katalogitems für Zufallsaktionen erlauben**.
3. In der Regel die Aktion wählen:

| Aktion | Verhalten |
| --- | --- |
| Zufällige Falle | Wählt aus dem Fallenpool |
| Zufälliges Item · gut oder schlecht | Wählt aus sämtlichen erlaubten Items des Zielslots |
| Zufallsaktion | Wählt erlaubte Items; DeathLink kann ausdrücklich eingeschlossen werden |

4. Als Ziel **Mehrere ausgewählte Slots** wählen und die gewünschten Spieler ankreuzen. Alternativ einen einzelnen, einen zufälligen oder alle geeigneten Slots verwenden.
5. Für DeathLink sowohl die Option im Spielclient als auch **DeathLink-Gruppenaktionen für diese Sitzung erlauben** in der Bridge aktivieren. DeathLink erreicht die aktivierte Gruppe im eigenen AP-Team und bleibt eine Gruppenaktion.
6. Regel simulieren; danach im echten Raum Live-Modus wählen, die Ausführung starten und eine aktive Regel mit **Live-Test** prüfen.

Unter **Ereignisse** stehen Eingänge, Aufträge und Systemprotokoll. Zusätzlich kann nach Spiel gefiltert werden. „AP bestätigt“ quittiert die Annahme am Server; der Spieleffekt selbst wird vom Spielclient verarbeitet.

## Gespeicherte Verbindungen

Zuletzt aktiv verbundene Quellen werden beim Neustart oder Öffnen des Raums wieder verbunden. Ausführung und Live-Modus starten dabei pausiert im Testmodus. **Trennen** beendet die automatische Wiederverbindung für diese Quelle. **Gespeicherte … vergessen** entfernt deren lokale Zugangsdaten.

Zur Sicherung die geschlossene Bridge und ihren gesamten **`data`-Ordner** kopieren. Der Ordner enthält auch die verschlüsselten Zugangsdaten und den zugehörigen lokalen Schlüssel. Der Konfigurationsexport enthält keine Passwörter oder Twitch-Tokens.

## Quellen

- [Make-A-Wish / Charity Royale API](https://streamer.make-a-wish.at/api)
- [Archipelago-Kommandos](https://archipelago.gg/tutorial/Archipelago/commands_en)
- [Archipelago YAML-Optionen](https://archipelago.gg/tutorial/Archipelago/advanced_settings_en)
- [Twitch OAuth](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/)
- [Twitch Token-Erneuerung](https://dev.twitch.tv/docs/authentication/refresh-tokens/)
- [Twitch EventSub-WebSockets](https://dev.twitch.tv/docs/eventsub/handling-websocket-events/)

## Räume archivieren oder löschen

Unter **Räume** archivieren, nach **Archiviert** filtern und bei Bedarf **Wiederherstellen** wählen. Regeln, Protokolle und Zugangsdaten bleiben beim Archivieren erhalten. **Löschen** verlangt den exakten Raumnamen und entfernt die lokalen Daten dieses Raums endgültig. Der Spielekatalog bleibt erhalten. Beim Archivieren oder Löschen des geöffneten Raums wechselt die Bridge in einen anderen Raum.

## Gezielt oder zufällig einen Spieler treffen

1. Unter **Spielslots** auf **+ Spieler** klicken. Pro Teilnehmer Slotname und optional Spiel eintragen; **Spieler speichern** wählen. Bei verbundenem AP-Raum wird der nächste noch nicht eingetragene Slot vorgeschlagen.
2. Für die tatsächlichen AP-Slots unter **Effekte & Freigabe** die gewünschten Items oder Fallen erlauben.
3. In der Regel als **Ziel** einen bestimmten Spieler, **Alle freigegebenen Spieler**, **Zufälliger freigegebener Spieler**, **Mehrere ausgewählte Spieler** oder **Zufällig aus ausgewählten Spielern** wählen. Bei den letzten beiden Modi die Teilnehmer markieren; **Gespeicherte Spieler auswählen** übernimmt eure Liste.
4. Die Regel zuerst simulieren. Zufall aus der Auswahl trifft pro Auslösung genau eine geeignete Person; mehrere oder alle erzeugt Aktionen pro geeignetem Spieler.

Die Spielerliste erzeugt keine zusätzlichen Serververbindungen: Eine Bridge-Verbindung zu eurem AP-Raum reicht aus. DeathLink bleibt eine Gruppenaktion des AP-Teams.

## Programmupdates

1. **Einrichtung → Programmupdates → Nach Updates suchen** öffnen.
2. Solange das Repo privat ist, einen [Fine-grained Token](https://github.com/settings/personal-access-tokens/new) für `BR3TZN/AP-Chaos-Bridge` mit **Contents: Read-only** unter **GitHub-Zugang für private Repositories** speichern.
3. **Update herunterladen** wählen und die Prüfung abwarten.
4. **Installieren & neu starten** wählen. Räume, Regeln und Zugangsdaten bleiben erhalten; die Bridge startet im Testmodus und pausiert.
5. Bei einem Fehler wird die vorherige Version wiederhergestellt. Protokolle: `data/updates/install.log` und `restart.log`; Sicherungen: `data/updates/backups/`. Falls die Oberfläche nicht zurückkommt, `Start.cmd` öffnen.

Die erste Installation der Updatefunktion erfolgt manuell mit dem vollständigen Release-ZIP. `data` dabei beibehalten.

## Spieler-YAMLs verwenden

Der Katalog zeigt nur eingelesene APworlds. Nach diesem Update alte Platin-YAMLs erneut exportieren. Die angezeigte World-Version und Mindestversion von Archipelago beachten. Die passende `.apworld` in Archipelagos `custom_worlds` installieren, Spieler-YAMLs in `Players` legen und daraus den Seed generieren. Die YAML ist eine Konfigurationsdatei für den Generator.
