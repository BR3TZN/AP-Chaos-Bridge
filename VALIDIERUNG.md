# Prüfung der Version 0.3.0

Ausgeführt unter Linux mit Node.js 24.19.0 und Python 3.12.14. Node.js ab 22 ist erforderlich; neue APworld-Analysen benötigen Python ab 3.10.

## Automatisierte Prüfungen

**73 Tests** über `npm test` führen die echten Module, HTTP-Routen, Formularhandler in JSDOM und lokale WebSocket-Gegenstellen aus.

| Bereich | Prüfumfang |
|---|---|
| Regeln und Versand | Ereignisse, Deduplizierung, Limits, Cooldowns, Pause, Notaus, Testmodus, persistierte Aufträge und AP-Protokoll |
| Verbindungen | Maskierte und verschlüsselte Zugangsdaten, AP-Wiederverbindung, Twitch-Code-Flow, Tokenwechsel, Refresh und Origin-Schutz |
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
- Die Windows-Startdateien sind enthalten; diese Ausführung erfolgte unter Linux.
- Core-Spiele ohne eigenständige APworld benötigen eine zusätzliche Integration für den Einstellungseditor.
- APworld-Import erzeugt keine universellen Live-Aktionen und keine Run-Reset-Funktion.
