# Hammurabi — recuperación rápida cuando deja de funcionar en local

**Fecha:** 2026-05-15
**Contexto:** Continúa y supera [2026-05-14_Hammurabi_Fix.md](2026-05-14_Hammurabi_Fix.md). Lee primero ese documento para entender el porqué de los parches.

---

## TL;DR — Pasos para arreglarlo sin IA

1. Abrí PowerShell en la raíz del repo: `C:\Work\repo\Goal Legends Arena`
2. Ejecutá:
   ```powershell
   .\patches\apply-hammurabi-patches.ps1
   ```
3. Probá: `npm start`
4. Verificá que en la consola aparezca:
   ```
   Starting Multiplayer Server with realm: http://localhost:XXXX
   [PATCH] Using local hammurabi-test at ...\dist\cli.js
   ```

Si ves esas dos líneas, ya está. Si no, mirá la sección [Diagnóstico manual](#diagnóstico-manual).

---

## Qué hace el script

`patches/apply-hammurabi-patches.ps1` ejecuta tres pasos:

1. **Si `hammurabi-test/node_modules` no existe**, corre `npm install` adentro de `hammurabi-test/` para reinstalar `@dcl/hammurabi-server` desde la versión pinneada en `hammurabi-test/package.json`.
2. **Copia** `patches/hammurabi-server.launcher.js` →
   `node_modules/@dcl/sdk-commands/dist/commands/start/hammurabi-server.js`
   (este parche se borra cada vez que se hace `npm install` en la raíz o cuando el Creator Hub actualiza su tooling).
3. **Copia** `patches/hammurabi-server.login.js` →
   `hammurabi-test/node_modules/@dcl/hammurabi-server/dist/lib/decentraland/identity/login.js`
   (este parche se borra cuando se reinstala `hammurabi-test/`).

Los dos archivos fuente (`patches/hammurabi-server.launcher.js` y `patches/hammurabi-server.login.js`) **están versionados en git**, así que sobreviven a cualquier reinstalación de `node_modules`.

---

## Cuándo correr el script

Re-aplicá los parches después de cualquiera de estas acciones:

- `npm install` o `npm ci` en la raíz del repo
- `npm install` dentro de `hammurabi-test/`
- Actualización del Creator Hub
- Upgrade de `@dcl/sdk` / `@dcl/sdk-commands` / `@dcl/js-runtime`
- Bumpear `@dcl/hammurabi-server` en `hammurabi-test/package.json`

Síntomas de que los parches se perdieron:

- `npm start` corre, dice `Bundle saved bin/index.js` y `Preview server is now running!`, pero **no** aparece la línea `Starting Multiplayer Server` o `[PATCH] Using local hammurabi-test...`
- El cliente no se conecta a multiplayer / no aparecen otros jugadores
- Error en consola: `secp256k1.getPublicKey is not a function`
- En Windows: `spawn EINVAL`

---

## Qué se hizo en esta sesión (2026-05-15)

### Problema inicial
`hammurabi-test/node_modules` había desaparecido (probablemente borrado por una reinstalación previa). El launcher parcheado caía al fallback de `npx`, que tampoco terminaba arrancando bien.

### Pasos seguidos
1. **Verifiqué el doc previo** ([2026-05-14_Hammurabi_Fix.md](2026-05-14_Hammurabi_Fix.md)) para entender qué archivos tenían parches y dónde.
2. **Confirmé que el parche del launcher** (`node_modules/@dcl/sdk-commands/.../hammurabi-server.js`) **seguía en su lugar** — no había sido sobrescrito.
3. **Detecté que `hammurabi-test/node_modules` no existía.** Corrí `npm install` dentro de `hammurabi-test/` para reinstalar `@dcl/hammurabi-server`.
4. **Verifiqué el parche de `login.js`**: la versión nueva del paquete ya venía con el shim de `secp256k1` v1/v2 aplicado por el `npm install` reciente (el `package.json` pinnea una versión que ya lo trae).
5. **El servidor seguía sin arrancar.** Aparecía `[PATCH] Using local hammurabi-test at ...\dist\index.js` pero el proceso moría silenciosamente con código 0.
6. **Bug descubierto en el parche del launcher:** apuntaba a `dist/index.js`, pero ese archivo es solamente el entry de librería que exporta tipos — no levanta servidor. El binario real es `dist/cli.js` (ver `package.json` de hammurabi-server: `"bin": { "hammurabi-server": "dist/cli.js" }`).
7. **Arreglé el launcher**: cambié `'index.js'` → `'cli.js'` en
   [`node_modules/@dcl/sdk-commands/dist/commands/start/hammurabi-server.js`](../node_modules/@dcl/sdk-commands/dist/commands/start/hammurabi-server.js)
   (línea con `const localEntry = path_1.join(...)`).

### Persistencia de la solución
- Copié los dos archivos parcheados ya-corregidos a `patches/` dentro del repo (versionados en git).
- Creé `patches/apply-hammurabi-patches.ps1` para automatizar la re-aplicación.

---

## Archivos relevantes

| Archivo | Rol |
|---------|-----|
| `patches/hammurabi-server.launcher.js` | Fuente versionada del launcher parcheado (apunta a `cli.js`). |
| `patches/hammurabi-server.login.js` | Fuente versionada del `login.js` parcheado (shim `secp256k1` v2 + `.slice(1)`). |
| `patches/apply-hammurabi-patches.ps1` | Script que copia esos dos archivos a sus rutas en `node_modules/`. |
| `hammurabi-test/package.json` | Pinnea la versión de `@dcl/hammurabi-server` usada en preview. |
| `docs/2026-05-14_Hammurabi_Fix.md` | Documento original con el porqué técnico de los parches. |

---

## Diagnóstico manual

Si después de correr el script `npm start` sigue sin levantar Hammurabi, andá probando por orden:

### A. ¿Existe el entry point?
```powershell
Test-Path "hammurabi-test\node_modules\@dcl\hammurabi-server\dist\cli.js"
```
Si devuelve `False`: corré `cd hammurabi-test; npm install; cd ..` y volvé a correr el script de parches.

### B. ¿El launcher en sdk-commands tiene el parche?
```powershell
Select-String -Path "node_modules\@dcl\sdk-commands\dist\commands\start\hammurabi-server.js" -Pattern "PATCH"
```
Si no devuelve nada: el parche se perdió. Corré el script.

### C. ¿El servidor arranca a mano?
```powershell
node hammurabi-test\node_modules\@dcl\hammurabi-server\dist\cli.js --realm=http://localhost:8001
```
Si imprime un error: ese es el error real, anótalo y subilo a un nuevo doc (`2026-XX-XX_Hammurabi_<síntoma>.md`).
Si sale silenciosamente sin imprimir nada: estás corriendo `index.js` en lugar de `cli.js` por error.

### D. ¿`npm start` muestra `[PATCH] Using local hammurabi-test at ...\dist\cli.js`?
Si dice `...\dist\index.js` (no `cli.js`): el launcher en `node_modules/` es la versión vieja y rota. Corré el script.

### E. Última opción: bumpear la versión de hammurabi-server
Si nada de lo anterior funciona, puede que la versión pinneada en `hammurabi-test/package.json` haya quedado incompatible con el SDK actualizado. Probá actualizar a `next`:
```powershell
cd hammurabi-test
npm install @dcl/hammurabi-server@next
cd ..
.\patches\apply-hammurabi-patches.ps1
```
Si esto arregla, actualizá `hammurabi-test/package.json` con la nueva versión exacta y commiteá.

---

## Cuándo dejar de necesitar estos parches

Cuando Decentraland publique una versión de `@dcl/sdk-commands` que ya invoque a hammurabi correctamente con `cli.js` y una versión de `@dcl/hammurabi-server` compilada contra `ethereum-cryptography@2.x`, todo esto se puede borrar:

- La carpeta `patches/`
- La carpeta `hammurabi-test/`
- Esta doc y la del 2026-05-14

Para confirmar, probá `npm start` sin parches después de un SDK upgrade. Si Hammurabi levanta sin tocar nada, listo.
