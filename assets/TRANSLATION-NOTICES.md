# Lokale Übersetzung

Die Bridge verwendet @browsermt/bergamot-translator 0.4.9 (Bergamot / Marian NMT) und das Mozilla-Modell Englisch → Deutsch 2.1. Beide stehen unter MPL-2.0; der Lizenztext liegt neben dieser Datei in TRANSLATION-LICENSE.txt.

Engine-Quellen: https://github.com/browsermt/bergamot-translator
Engine-Paket einschließlich Worker-Quellen: https://registry.npmjs.org/@browsermt/bergamot-translator/-/bergamot-translator-0.4.9.tgz
Modell-Quellen und Lizenz: https://github.com/mozilla/firefox-translations-models
Gepinnte Modelldateien, Größen und SHA256-Werte: help-translation-model.json

Die lokale Node-Anpassung ist in lib/help-translation-worker.cjs offengelegt. Sie stellt den CommonJS-Kontext des Original-Workers und korrekte Datei-URLs auf Windows her. Die installierten Upstream-Dateien bleiben unverändert. Die redaktionellen deutschen Texte in help-translations.de.json gehören zur Bridge. Weitere Texte werden automatisch lokal übersetzt und sind im Editor entsprechend gekennzeichnet.
