# AP Chaos Bridge 0.4.1

- **SpongeBob SquarePants: Battle for Bikini Bottom 1.2.5** ergänzt. Im Spielekatalog nach **Bikini Bottom** suchen. 22 vorbereitete Einstellungen einschließlich Pfannenwender-Anzahl, Socken, Fähigkeiten, Tor-Kosten, DeathLink und RingLink; YAMLs für mehrere Slotnamen exportieren. Bekannte Dateiversion funktioniert ohne Python auch bei Upload, Umbenennung oder eigenem APworld-Ordner.
- Größere APworlds unterstützt: Die originale BfBB-Datei ist rund 80 MB groß und überschritt die bisherigen Grenzen. Jetzt **128 MiB pro APworld**, bis 512 MiB deklarierte entpackte Daten; ausgewählte Python-/Manifestdateien bleiben auf je 8 MiB und zusammen 32 MiB begrenzt. Client-Binärdateien werden beim Einlesen nicht entpackt oder ausgeführt.
- Gleiche Importgrenzen für Dateiauswahl, HTTP-Upload, Ordnerscan, Metadaten-Builder und Katalogdownload. Der Downloader kann größere Release-ZIPs mit enthaltenen APworlds lesen. Der Uploaddialog erklärt das vorherige Entpacken eines Release-ZIPs.
- Vollständiger Katalog: **768 APworld-Dateien, 782 World-Varianten, 758 erkannte Spiele**. Drei bekannte Pakete ohne statische World-Deklaration bleiben separat als übersprungen erklärt.
- **114 Tests**, darunter echter Upload der vollständigen BfBB-Datei, Import ohne Python, YAML-Export für mehrere Spieler und Größenbegrenzungen. Standard- und geänderte BfBB-YAML mit den echten Optionsklassen von **Archipelago 0.6.7** geprüft: beide akzeptiert. Gesamter YAML-Bestand erneut mit YAML 1.1 und PyYAML geprüft.

## Aktualisieren und verwenden

**Einstellungen → Programmupdates → Nach Updates suchen → Update herunterladen → Installieren & neu starten**. Danach bei Bedarf mit Strg+F5 neu laden. Aus Versionen vor 0.4.0 heißt die Seite noch **Einrichtung**. Zugangsdaten und Räume bleiben erhalten; die Bridge startet im Testmodus und pausiert.

Alternativ **AP-Chaos-Bridge-v0.4.1.zip** vollständig entpacken, Bridge beenden und Programmdateien ersetzen; **data beibehalten**. Node.js ab 22 bleibt erforderlich.

Für weitere Spiele das passende Release-ZIP entpacken und die enthaltene `.apworld` hochladen. Die Bridge kann auch direkt Archipelagos `custom_worlds` als APworld-Ordner einlesen. Unbekannte Dateiversionen benötigen Python ab 3.10 für die statische Analyse. Die eigentliche Archipelago-Installation und die vom World-Entwickler benötigten Spielclients/Bibliotheken bleiben zusätzlich notwendig.

BfBB 1.2.5 benötigt Archipelago ab 0.6.7 und für das veröffentlichte Windows-Paket dessen Python 3.13. Gespielt wird die US-GameCube-Fassung über Dolphin. [Offizielle Einrichtung](https://github.com/Cyb3RGER/bfbb_ap_world/blob/v1.2.5/docs/setup_en.md).

Prüfgrenze: YAML-Format und Optionsprüfungen wurden ausgeführt; keine vollständige Seed-/ROM-Generierung und kein Spieleffekt in Dolphin. Die Oberflächenabläufe sind automatisiert mit JSDOM geprüft.
