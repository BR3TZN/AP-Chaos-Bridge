# Prüfung der Version 0.4.0

Ausgeführt unter Linux mit Node.js 24.19.0 und Python 3.12.14. Node.js ab 22 ist erforderlich. Vorbereitete APworld-Versionen funktionieren ohne Python; die statische Analyse bisher unbekannter Versionen benötigt Python ab 3.10.

## Automatisierte Prüfungen

**109 Tests** über `npm test` führen die echten Module, HTTP-Routen, Formularhandler in JSDOM und lokale WebSocket-Gegenstellen aus.

| Bereich | Prüfumfang |
|---|---|
| Regeln und Versand | Ereignisse, Deduplizierung, Limits, Cooldowns, Pause, Notaus, Testmodus, persistierte Aufträge und AP-Protokoll |
| Verbindungen | Maskierte und verschlüsselte Zugangsdaten, AP-Wiederverbindung, Twitch-Code-Flow, Tokenwechsel, Refresh und Origin-Schutz |
| Programmupdates | Versionsvergleich, Token ohne Weitergabe bei Redirects, SHA-256, ZIP-Pfade, vollständiges Manifest, erhaltene Räume und eigene APworlds, Sicherungen, Rücknahme bei Schreibfehlern, echter Neustart und Rückkehr zu Programm und Daten der vorherigen Version bei Startfehlern |
| Raumarchiv | Archivieren des geöffneten Raums mit Wechsel, Wiederherstellung nach Neustart, erhaltene Regeln, Historie und Zugangsdaten |
| Löschen | Exakte Namensbestätigung, eigene Raumdateien und Zugangsdaten entfernen, gemeinsame Daten erhalten, kein Wiederanlegen des gelöschten Standardraums |
| APworlds | CRC-Prüfung, Pfade, Größenbegrenzung, rekursive Ordner, Vorrang eigener APworlds, Windows-Archivpfade, APworld-only, passende Metadaten-Hashes unabhängig von Dateiname und Ordner, HTTP-Upload aller sieben Nutzerdateien ohne Python, keine Ausführung des World-Codes |
| AST-Analyse | Modulbereiche, Import-Aliase, Konstanten, gleichnamige Klassen, Choice, TextChoice, NamedRange, dynamische Standards und Manifest-Fallback |
| Spielerziele | Einzelperson, alle, markierte Gruppe oder Zufall aus der Auswahl; nur freigegebene eigene Team-Slots; gespeicherte Profil-IDs beim Bearbeiten erhalten |
| YAMLs | Separate Spielerdateien, Slotvalidierung, gewichtete Zusatzoptionen, skalare Sammlungs-Presets und Zufallsbereiche |
| Design und Alerts | Kontraste für neutrale, helle und getönte Modi einschließlich freier Randfarben; globale Designpersistenz, getrennte Raum-Alerts, Medienupload, Vorschau ohne AP-Aktion, keine historischen Alerts, Reihenfolge und Raumwechsel |
| Neue Aktionen | Eigene Itempools, Ausschluss markierter Fallen, gleichverteilte Auswahl möglicher Aktionsarten, Chat-Präfix gegen Befehlsausführung, Hint-Befehl und reine Alerts ohne AP-Verbindung |
| Oberfläche | Regelerstellung trotz benanntem id-Feld, Katalogsuche, Mehrspieler-Vorschau, Raumarchiv, Löschbestätigung, eigene Range-Werte, Plus-Spielerzeilen und Zufallsziel aus einer gespeicherten Gruppe |

`npm run check` prüft die JavaScript-Syntax, JSON-Dateien, HTML-Verweise und vorhandene Laufzeitpakete.

## Prüfung des APworld-Bestands

Der vollständige Lauf prüfte **767 APworld-Dateien**, **781 World-Varianten** und den Standardwert-Export für **757 Spielnamen**, ohne Validierungsfehler. Drei Dateien liefern noch keinen statisch erkennbaren Spielnamen; sie werden nach Inhalts-Hash erkannt und im Einlesebericht separat als übersprungen aufgeführt. Der Fall wird ohne verfügbaren Python-Interpreter geprüft.

`npm run validate:worlds` prüft Herkunft und SHA-256 jeder Datei, den Laufzeit-ZIP-Leser und den YAML-Export der statisch erkannten Standards jeder World-Variante. Das Ergebnis steht in `assets/apworld-validation.json`. Erkannte und teilweise dynamische Einstellungen sowie Importfehler stehen in `APWORLDS-MANUELL.md`.

Der Bestandsprüfer führt keine APworld-Module aus und generiert keinen Archipelago-Seed. Dynamische Felder bleiben ausdrücklich offen. Eine erfolgreiche YAML-Ausgabe belegt keine Kompatibilität einer beliebigen World-Version mit einer beliebigen Archipelago-Installation.

## Prüfgrenzen

- Kein echter Twitch-Konto-Login, keine Spende und kein echter Spieleffekt wurden ausgelöst.
- Die neuen Oberflächenabläufe wurden mit JSDOM und der echten lokalen API geprüft. Diese Version wurde nicht zusätzlich in einem interaktiven Chromium-Browser geprüft.
- Der Release-Workflow führt die automatisierten Tests zusätzlich unter Windows und Linux aus. Das manuelle Öffnen der Windows-Startdatei wurde hier nicht geprüft.
- Core-Spiele ohne eigenständige APworld benötigen eine zusätzliche Integration für den Einstellungseditor.
- APworld-Import erzeugt keine universellen Live-Aktionen und keine Run-Reset-Funktion.

## YAML-1.1- und Platin-Prüfung

Alle **781 World-Varianten** wurden exportiert und sowohl mit dem YAML-1.1-Leser der JavaScript-Bibliothek als auch mit **PyYAML 6.0.3** erneut gelesen. Sämtliche Werte, Schlüssel und Datentypen wurden mit den Exportdaten verglichen: keine Abweichungen. `npm run validate:worlds -- --pyyaml` reproduziert diese Prüfung; dazu Python mit PyYAML installieren (`python -m pip install PyYAML==6.0.3`). Die normale Bridge benötigt PyYAML nicht.

Pokémon Platin wurde zusätzlich mit dem unveränderten **Archipelago 0.6.7** (Commit `debe4cf035c7c15efe6fb95f72343af0d420c68c`) und der mitgelieferten **APworld 0.2.2** geprüft. Archipelagos `Generate.roll_settings` und `PokemonPlatinumOptions.validate` akzeptieren die Standarddatei sowie zwei Varianten mit geänderten Optionen. Jeweils **99 reale Optionsklassen** wurden verarbeitet. Der vorherige Export scheiterte nachweislich an `hm_reader: no`, das PyYAML als `false` statt als Auswahltext interpretierte. Ergebnis und APworld-Prüfsumme stehen in `assets/pokemon-platinum-validation.json`.

Die vollständige Prüfung aller Worlds umfasst YAML-Format und Datentypen; sie ist keine Seed-Generierung für sämtliche Spiele. Laufzeitabhängige Optionen, benutzerdefinierte Zusatzoptionen, ROM-Ausgabe und Spielclients müssen mit der jeweils passenden APworld geprüft werden. Der produktive Katalogimport bleibt statisch und führt keinen World-Code aus.

Für eine gezielte Entwicklerprüfung kann `scripts/validate_archipelago.py --archipelago PFAD_ZUM_AP_QUELLCODE --apworld DATEI.apworld Spieler.yaml` verwendet werden. Dieser ausdrückliche Prüfaufruf importiert die ausgewählte APworld und benötigt deren passende Python-Laufzeitpakete.

## Sieben Nutzer-APworlds in 0.3.2

Die sieben bereitgestellten Archive wurden unverändert per SHA-256 zugeordnet. Fünf waren bereits identisch enthalten; KH3 0.16.11 und Bloons TD6 0.8.2 wurden ergänzt. Bloons 0.8.3 bleibt verfügbar. Pro Spiel gibt es einen Katalogeintrag; eine eigene World im Hauptordner hat Vorrang.

Für alle sieben wurden frische Kopien in einem fremden Ordner und umbenannte Dateien eingelesen sowie echte HTTP-Uploads ausgeführt. Die Tests sperren den Python-Aufruf ausdrücklich: Scan, Neustart, Upload und YAML-Export funktionieren trotzdem. Ein anderer Dateiinhalt darf keine Metadaten eines bekannten Dateinamens übernehmen.

Zusätzlich wurden Standard-YAML und eine geänderte Konfiguration jeder World mit dem echten **Archipelago 0.6.7** und exakt der hochgeladenen APworld geprüft. `Generate.roll_settings` führt auch die `verify`-Methoden der Optionsklassen aus; anschließend wird eine vorhandene `options.validate()` aufgerufen. Alle **14 YAML-Dateien** wurden akzeptiert. Ergebnis, Versionen und Hashes: `assets/uploaded-worlds-validation.json`.

| Spiel | World-Version | Optionsklassen pro YAML | Ergebnis |
|---|---|---:|---|
| Bloons TD6 | 0.8.2 | 43 | Standard und geändert akzeptiert |
| Cyberpunk 2077 | 0.7.0 | 49 | Standard und geändert akzeptiert |
| Kingdom Hearts III | 0.16.11 | 113 | Standard und geändert akzeptiert |
| Minecraft | 2.2.0 | 27 | Standard und geändert akzeptiert |
| Pokemon Platinum | 0.2.2 | 99 | Standard und geändert akzeptiert |
| Ratchet & Clank 2 | nicht im Manifest angegeben | 27 | Standard und geändert akzeptiert |
| The Binding of Isaac Repentance | 0.4.3 | 52 | Standard und geändert akzeptiert |

Geänderte Konfigurationen aktivieren DeathLink; Platin verwendet zusätzlich `hm_reader: precollected` und die DeathLink-Gruppe `Chaos`. Für Bloons und Isaac wurde zusätzlich eine Trap-Gewichtung geändert. Die Prüfungen generieren keine vollständigen Seeds oder ROM-Ausgaben und starten keine Spielclients.

Nach der Umstellung auf öffentliche Sichtbarkeit wurden die Release-Abfrage und der binäre Download über den echten Updater **ohne Token** mit HTTP 200 geprüft.

Das vollständige ZIP wurde mit dem echten Update-Entpacker und Dateimanifest geprüft und die entpackte Bridge gestartet. Mit einem absichtlich ungültigen Python-Pfad lud ein fremder APworld-Ordner alle sieben Nutzerdateien, erzeugte YAMLs und blieb im Testmodus mit pausierter Ausführung.
