# Prüfung der Version 0.3.1

Ausgeführt unter Linux mit Node.js 24.19.0 und Python 3.12.14. Node.js ab 22 ist erforderlich; neue APworld-Analysen benötigen Python ab 3.10.

## Automatisierte Prüfungen

**87 Tests** über `npm test` führen die echten Module, HTTP-Routen, Formularhandler in JSDOM und lokale WebSocket-Gegenstellen aus.

| Bereich | Prüfumfang |
|---|---|
| Regeln und Versand | Ereignisse, Deduplizierung, Limits, Cooldowns, Pause, Notaus, Testmodus, persistierte Aufträge und AP-Protokoll |
| Verbindungen | Maskierte und verschlüsselte Zugangsdaten, AP-Wiederverbindung, Twitch-Code-Flow, Tokenwechsel, Refresh und Origin-Schutz |
| Programmupdates | Versionsvergleich, Token ohne Weitergabe bei Redirects, SHA-256, ZIP-Pfade, vollständiges Manifest, erhaltene Räume und eigene APworlds, Sicherungen, Rücknahme bei Schreibfehlern, echter Neustart und Rückkehr zu Programm und Daten der vorherigen Version bei Startfehlern |
| Raumarchiv | Archivieren des geöffneten Raums mit Wechsel, Wiederherstellung nach Neustart, erhaltene Regeln, Historie und Zugangsdaten |
| Löschen | Exakte Namensbestätigung, eigene Raumdateien und Zugangsdaten entfernen, gemeinsame Daten erhalten, kein Wiederanlegen des gelöschten Standardraums |
| APworlds | CRC-Prüfung, Pfade, Größenbegrenzung, rekursive Ordner, Vorrang eigener APworlds, Windows-Archivpfade, APworld-only, passende Metadaten-Hashes, keine Ausführung des World-Codes |
| AST-Analyse | Modulbereiche, Import-Aliase, Konstanten, gleichnamige Klassen, Choice, TextChoice, NamedRange, dynamische Standards und Manifest-Fallback |
| Spielerziele | Einzelperson, alle, markierte Gruppe oder Zufall aus der Auswahl; nur freigegebene eigene Team-Slots; gespeicherte Profil-IDs beim Bearbeiten erhalten |
| YAMLs | Separate Spielerdateien, Slotvalidierung, gewichtete Zusatzoptionen, skalare Sammlungs-Presets und Zufallsbereiche |
| Oberfläche | Regelerstellung trotz benanntem id-Feld, Katalogsuche, Mehrspieler-Vorschau, Raumarchiv, Löschbestätigung , eigene Range-Werte, Plus-Spielerzeilen und Zufallsziel aus einer gespeicherten Gruppe |

`npm run check` prüft die JavaScript-Syntax, JSON-Dateien, HTML-Verweise und vorhandene Laufzeitpakete.

## Prüfung des APworld-Bestands

Der vollständige Lauf prüfte **765 APworld-Dateien**, **779 World-Varianten** und den Standardwert-Export für **756 Spielnamen**, ohne Validierungsfehler. Drei Dateien liefern noch keinen statisch erkennbaren Spielnamen; sie sind in der manuellen Liste aufgeführt.

`npm run validate:worlds` prüft Herkunft und SHA-256 jeder Datei, den Laufzeit-ZIP-Leser und den YAML-Export der statisch erkannten Standards jeder World-Variante. Das Ergebnis steht in `assets/apworld-validation.json`. Erkannte und teilweise dynamische Einstellungen sowie Importfehler stehen in `APWORLDS-MANUELL.md`.

Der Bestandsprüfer führt keine APworld-Module aus und generiert keinen Archipelago-Seed. Dynamische Felder bleiben ausdrücklich offen. Eine erfolgreiche YAML-Ausgabe belegt keine Kompatibilität einer beliebigen World-Version mit einer beliebigen Archipelago-Installation.

## Prüfgrenzen

- Kein echter Twitch-Konto-Login, keine Spende und kein echter Spieleffekt wurden ausgelöst.
- Die neuen Oberflächenabläufe wurden mit JSDOM und der echten lokalen API geprüft. Diese Version wurde nicht zusätzlich in einem interaktiven Chromium-Browser geprüft.
- Der Release-Workflow führt die automatisierten Tests zusätzlich unter Windows und Linux aus. Das manuelle Öffnen der Windows-Startdatei wurde hier nicht geprüft.
- Core-Spiele ohne eigenständige APworld benötigen eine zusätzliche Integration für den Einstellungseditor.
- APworld-Import erzeugt keine universellen Live-Aktionen und keine Run-Reset-Funktion.

## YAML-1.1- und Platin-Prüfung

Alle **779 World-Varianten** wurden exportiert und sowohl mit dem YAML-1.1-Leser der JavaScript-Bibliothek als auch mit **PyYAML 6.0.3** erneut gelesen. Sämtliche Werte, Schlüssel und Datentypen wurden mit den Exportdaten verglichen: keine Abweichungen. `npm run validate:worlds -- --pyyaml` reproduziert diese Prüfung; dazu Python mit PyYAML installieren (`python -m pip install PyYAML==6.0.3`). Die normale Bridge benötigt PyYAML nicht.

Pokémon Platin wurde zusätzlich mit dem unveränderten **Archipelago 0.6.7** (Commit `debe4cf035c7c15efe6fb95f72343af0d420c68c`) und der mitgelieferten **APworld 0.2.2** geprüft. Archipelagos `Generate.roll_settings` und `PokemonPlatinumOptions.validate` akzeptieren die Standarddatei sowie zwei Varianten mit geänderten Optionen. Jeweils **99 reale Optionsklassen** wurden verarbeitet. Der vorherige Export scheiterte nachweislich an `hm_reader: no`, das PyYAML als `false` statt als Auswahltext interpretierte. Ergebnis und APworld-Prüfsumme stehen in `assets/pokemon-platinum-validation.json`.

Die vollständige Prüfung aller Worlds umfasst YAML-Format und Datentypen; sie ist keine Seed-Generierung für sämtliche Spiele. Laufzeitabhängige Optionen, benutzerdefinierte Zusatzoptionen, ROM-Ausgabe und Spielclients müssen mit der jeweils passenden APworld geprüft werden. Der produktive Katalogimport bleibt statisch und führt keinen World-Code aus.

Für eine gezielte Entwicklerprüfung kann `scripts/validate_archipelago.py --archipelago PFAD_ZUM_AP_QUELLCODE --apworld DATEI.apworld Spieler.yaml` verwendet werden. Dieser ausdrückliche Prüfaufruf importiert die ausgewählte APworld und benötigt deren passende Python-Laufzeitpakete.
