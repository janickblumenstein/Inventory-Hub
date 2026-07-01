# ShedSync als Android-App (Capacitor + Brother-Direktdruck)

Ziel: Die Web-App als Android-App verpacken, damit Etiketten **per Knopfdruck
über Bluetooth** an den Brother **PT-P710BT** gedruckt werden.

Die App läuft im **Server-Modus**: Die native Hülle lädt die gehostete Web-App
(`https://shedsync.vercel.app`) und stellt zusätzlich das Brother-Plugin bereit.
→ Ein Codebestand, Web-Updates erscheinen sofort in der App. Ein neuer APK-Build
ist nur nötig, wenn sich **native** Teile (Plugin/Permissions/Config) ändern.

Auf PC- und iPhone-**Browsern** ändert sich nichts: dort greift automatisch der
`window.print()`-Fallback.

---

## Wo läuft was? (wichtig zum Verständnis)

- Alle `npm`- und `npx cap`-Befehle tippst Du in ein **Terminal** im
  Projektordner (z. B. das Terminal-Tab in VS Code) — **nicht** in Android Studio.
- Wo landet was?
  - `npm install …` → lädt Pakete nach **`node_modules/`** und trägt sie in
    **`package.json`** ein.
  - `npx cap add android` → erzeugt den Ordner **`android/`** (ein komplettes
    Android-Studio-Projekt).
  - `npx cap sync` → kopiert den **nativen** Code der Plugins in `android/`.
  - `npx cap open android` → öffnet den `android/`-Ordner in **Android Studio**,
    wo Du mit ▶ **Run** aufs Handy baust.
- Kurz: Es liegt alles sichtbar im Projektordner. Nichts installiert sich
  „irgendwo versteckt".

---

## 0. Voraussetzungen (einmalig)

- **Node.js** (hast Du)
- **Android Studio** + **JDK 17**
- **Android-Handy** im Entwicklermodus (USB-Debugging an) — nur fürs Testen.
- Der **PT-P710BT via Bluetooth in den Android-Einstellungen gekoppelt**.

Bereits im Projekt: `@capacitor/core`, `@capacitor/cli`, `@capacitor/android`,
`capacitor.config.ts` (zeigt auf `https://shedsync.vercel.app`).

> Falls Du vorher `@rdlabo/capacitor-brotherprint` installiert hattest: wieder
> entfernen (`npm uninstall @rdlabo/capacitor-brotherprint`). Es unterstützt den
> PT-P710BT **nicht**.

---

## 1. Android-Plattform hinzufügen

```bash
npm install
npx cap add android
```

## 2. Brother-Plugin einbinden (unterstützt den PT-P710BT)

```bash
npm install github:AbobosSoftware/cordova-plugin-brother-label-printer
npx cap sync
```

Capacitor erkennt das Cordova-Plugin automatisch. Es bündelt das Brother Print
SDK für Android und stellt im WebView `cordova.plugins.brotherPrinter` bereit —
genau das, was `lib/brotherPrint.ts` anspricht. **Kein Code-Anpassen nötig.**

## 2b. Plugin für Bluetooth-Laufzeitrechte

Android 12+ zeigt/gewährt die Bluetooth-Rechte erst, wenn die App sie zur
Laufzeit **aktiv anfragt** (die Manifest-Einträge allein reichen nicht). Dafür:

```bash
npm install cordova-plugin-android-permissions
npx cap sync
```

Damit fragt die App beim ersten „Drucker suchen" den Android-Dialog ab. Ohne
dieses Plugin bleibt die Druckersuche leer.

## 3. Bluetooth-Berechtigungen (Android 12+)

In `android/app/src/main/AndroidManifest.xml` innerhalb von `<manifest>`:

```xml
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
<uses-permission android:name="android.permission.BLUETOOTH_SCAN" />
<uses-permission android:name="android.permission.BLUETOOTH" />
<uses-permission android:name="android.permission.BLUETOOTH_ADMIN" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
```

Diese Rechte werden zur Laufzeit einmal abgefragt.

## 4. Bauen & auf dem Handy starten

```bash
npx cap open android
```

In Android Studio: Handy wählen → ▶ **Run**. Der erste Gradle-Sync dauert etwas.

## 5. Drucker in der App koppeln

In der App **Einstellungen → Etikettendrucker (Brother)**. Die Felder sind schon
korrekt vorbelegt:

| Feld | Wert |
|------|------|
| Modell | `PT_P710BT` |
| Tape / Label-Größe | `W24` (= 24 mm) |
| Verbindung | Bluetooth |
| MAC-Adresse | per **„Drucker suchen"** füllen (oder manuell eintragen) |

Dann **Speichern**. Danach drucken **🖨️ Etikett** (Item-Detail) und
**🏷️ Etiketten** (Sammeldruck im Auswahlmodus) direkt per Bluetooth.

---

## Wie es zusammenspielt

- `lib/labelImage.ts` – rendert das Etikett (QR + Text) als PNG (Base64).
- `lib/brotherPrint.ts` – **einzige** Stelle mit Brother-/Plugin-Spezifika:
  `cordova.plugins.brotherPrinter` → `setPrinter` + `printViaSDK`.
- Item-Detail & Dashboard rufen `tryPrintNative(...)`; klappt das nicht
  (Browser/kein Drucker), wird `window.print()` genutzt.

## Updates

- **Web-Änderungen**: nach Vercel deployen – erscheinen ohne neuen APK-Build.
- **Neuer APK-Build** nur bei Änderungen an Plugin/Permissions/`capacitor.config.ts`
  (dann `npx cap sync` + in Android Studio neu bauen).

## iPhone (optional, später)

Braucht einen **Mac mit Xcode** zum Bauen. Bis dahin nutzen iPhones den
Browser-Fallback.
