# ShedSync als Android-App (Capacitor + Brother-Direktdruck)

Ziel: Die Web-App als Android-App verpacken, damit Etiketten **per Knopfdruck
über Bluetooth** an den Brother-Drucker (z. B. PT-P710BT) gedruckt werden.

Die App läuft im **Server-Modus**: Die native Hülle lädt die gehostete Web-App
(`https://shedsync.vercel.app`) und stellt zusätzlich das Brother-Plugin bereit.
→ Ein Codebestand, Web-Updates erscheinen sofort in der App. Ein neuer APK-Build
ist nur nötig, wenn sich **native** Teile (Plugins/Permissions/Config) ändern.

Auf PC- und iPhone-**Browsern** ändert sich nichts: dort greift automatisch der
`window.print()`-Fallback (Druck über den installierten Druckertreiber bzw. per
„Als PDF sichern → Teilen → Brother-App").

---

## 0. Voraussetzungen (einmalig auf Deinem Rechner)

- **Node.js** (hast Du)
- **Android Studio** + **JDK 17**
- Dein **Android-Handy** im Entwicklermodus (USB-Debugging an)
- Der **Brother-Drucker via Bluetooth in den Android-Einstellungen gekoppelt**

Bereits im Projekt hinterlegt (kein erneutes Installieren nötig):
`@capacitor/core`, `@capacitor/cli`, `@capacitor/android`, `capacitor.config.ts`.

---

## 1. Android-Plattform hinzufügen

```bash
npm install
npx cap add android
```

## 2. Brother-Plugin einbinden

Wir nutzen ein fertiges Capacitor-Plugin, das das native Brother Print SDK
kapselt. Empfohlen:

```bash
npm install @rdlabo/capacitor-brotherprint
npx cap sync
```

> **Wichtig – einmal verifizieren:** Der Code spricht das native Plugin unter dem
> Namen `BrotherPrint` an (siehe `lib/brotherPrint.ts`). Prüfe nach der
> Installation:
> 1. Registriert sich das Plugin unter genau diesem Namen? Falls nicht, den
>    Namen in `registerPlugin('BrotherPrint')` anpassen.
> 2. Kennt das Plugin **`PT_P710BT`** und einen **24-mm-Tape**-Wert? Die genauen
>    Enum-Strings trägst Du in der App unter **Einstellungen → Etikettendrucker**
>    in die Felder *Modell* und *Tape* ein — dafür ist kein Code-Rebuild nötig.
>    Falls das Plugin den P710BT nicht führt, alternativ das Plugin
>    `AbobosSoftware/cordova-plugin-brother-label-printer` verwenden (bringt das
>    Brother-Android-SDK v4.13 mit) und den Adapter in `lib/brotherPrint.ts`
>    entsprechend anpassen.

## 3. Bluetooth-Berechtigungen (Android 12+)

In `android/app/src/main/AndroidManifest.xml` innerhalb von `<manifest>`:

```xml
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
<uses-permission android:name="android.permission.BLUETOOTH_SCAN" />
<!-- für ältere Androids zusätzlich: -->
<uses-permission android:name="android.permission.BLUETOOTH" />
<uses-permission android:name="android.permission.BLUETOOTH_ADMIN" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
```

Diese Rechte müssen zur Laufzeit einmal vom Nutzer bestätigt werden (das
Plugin/Android fragt beim ersten Suchen/Drucken danach).

## 4. Bauen & auf dem Handy starten

```bash
npx cap open android
```

In Android Studio: Handy wählen → **Run**. Beim ersten Mal dauert der
Gradle-Sync etwas.

## 5. Drucker in der App koppeln

1. In der App **Einstellungen → Etikettendrucker (Brother)** öffnen.
2. **„Drucker suchen"** tippen → den P710BT auswählen (füllt MAC + Modell).
3. Feld **Tape / Label-Größe** auf den 24-mm-Wert des Plugins setzen.
4. **Speichern.**

Danach drucken die Buttons **🖨️ Etikett** (Item-Detail) und **🏷️ Etiketten**
(Sammeldruck im Auswahlmodus) direkt per Bluetooth.

---

## Wie es zusammenspielt (Kurzüberblick)

- `lib/labelImage.ts` – rendert das Etikett (QR + Text) als PNG (Base64).
- `lib/brotherPrint.ts` – **einzige** Stelle mit Brother-/Plugin-Spezifika:
  Erkennung nativer Umgebung, `printImage`, Druckersuche.
- Item-Detail & Dashboard rufen `tryPrintNative(...)`; klappt das nicht
  (Browser/kein Drucker), wird `window.print()` genutzt.

## Updates

- **Web-Änderungen** (UI, Logik): einfach nach Vercel deployen – erscheinen ohne
  neuen APK-Build in der App.
- **Neuer APK-Build** nur nötig bei Änderungen an Plugins, Permissions oder
  `capacitor.config.ts` (dann `npx cap sync` + in Android Studio neu bauen).

## iPhone (optional, später)

Dasselbe Plugin läuft auf iOS. Der Build braucht aber einen **Mac mit Xcode**
(`npx cap add ios`). Bis dahin nutzen iPhones den Browser-Fallback.
