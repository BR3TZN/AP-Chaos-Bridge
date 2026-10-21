# APworld-Ordner

Hier ausschließlich `.apworld`-Dateien mit ihren Originalnamen ablegen. Unterordner werden ebenfalls eingelesen. Eigene Dateien direkt in diesem Ordner haben Vorrang vor gleichnamigen Spielen aus Unterordnern. YAML-Dateien werden im Spielekatalog nicht importiert.

Danach in AP Chaos Bridge → Spielekatalog → **Ordner neu einlesen** wählen. Beim Start wird der gespeicherte Ordner ebenfalls eingelesen.

Mitgelieferte Dateien liegen nach Quelle und Hash in Unterordnern, damit gleichnamige Downloads sich nicht überschreiben. Im Editor steht der verwendete Dateipfad. Für die eigentliche Archipelago-Generierung die passende Datei in dessen `custom_worlds` installieren; abweichende Installationsnamen stehen in der manuellen Liste. Mehrere Versionen desselben Spiels nicht gleichzeitig installieren.

Für neue APworld-Analysen Python 3.10 oder neuer installieren. Die mitgelieferten Einstellungsdaten sind bereits vorbereitet. Die Bridge liest Python-Deklarationen, ohne World-Code auszuführen. Dynamische Angaben werden im Editor kenntlich gemacht.

Anleitung: [ANLEITUNG.md](../ANLEITUNG.md). Fehlende Downloads und Importgrenzen: [APWORLDS-MANUELL.md](../APWORLDS-MANUELL.md).
