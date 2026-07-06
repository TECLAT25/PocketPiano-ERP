# Deploy from Windows

This guide updates the Google Apps Script project from the GitHub repository.

## 1. Open PowerShell in the repository folder

Example:

```powershell
cd "C:\Users\Josep\Documents\PocketPiano-ERP"
```

Check that you are in the right folder:

```powershell
dir
```

You should see files such as `package.json`, `appsscript.json`, `src`, `html` and `css`.

## 2. Install dependencies

```powershell
npm install
```

## 3. Create the local clasp configuration

```powershell
copy .clasp.json.example .clasp.json
```

The example already contains the current PocketPiano ERP Script ID:

```text
1scct2IbazKldmgL8mHQhkJ56J5SE1IqpcnDpJfbc25oWLnbVPmuKplmW
```

## 4. Login to Google

```powershell
npm run login
```

Use the Google account that owns or can edit the Apps Script project.

## 5. Check status

```powershell
npm run status
```

If this command lists local and remote files, the connection is correct.

## 6. Push the latest code

```powershell
npm run deploy
```

## 7. Re-authorize Apps Script

Open Apps Script and run:

```javascript
install()
```

If Google asks for permissions, approve them. If the first run only authorizes permissions, run `install()` again.

## 8. Open the app

Reload the Google Sheet and open:

```text
PocketPiano ERP -> Open application
```

## Troubleshooting

### Project settings not found

You are not in the repository folder or `.clasp.json` is missing.

Run:

```powershell
copy .clasp.json.example .clasp.json
```

### ScriptApp.getProjectTriggers permission error

The manifest must include:

```text
https://www.googleapis.com/auth/script.scriptapp
```

After pushing the manifest, Apps Script must be re-authorized by running `install()` again.
