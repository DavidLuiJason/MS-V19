import fs from 'node:fs';
import path from 'node:path';

const APP_ID = 'app.marketscope.collector';
const ROOT = process.cwd();
const MAIN = path.join(ROOT, 'android', 'app', 'src', 'main');
const MANIFEST = path.join(MAIN, 'AndroidManifest.xml');
const JAVA_DIR = path.join(MAIN, 'java', ...APP_ID.split('.'));
const NATIVE_DIR = path.join(ROOT, 'native', 'android');
const FILES = ['MainActivity.java', 'CollectorService.java', 'NativeBridgePlugin.java'];

function fail(message) {
  console.error('PATCH FAILED: ' + message);
  process.exit(1);
}

if (!fs.existsSync(MANIFEST)) fail('AndroidManifest.xml not found at ' + MANIFEST);
if (!fs.existsSync(JAVA_DIR)) fail('Java package directory not found at ' + JAVA_DIR);

let manifest = fs.readFileSync(MANIFEST, 'utf8');

const permissions = [
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_SPECIAL_USE',
  'android.permission.POST_NOTIFICATIONS',
  'android.permission.WAKE_LOCK',
];
let permissionBlock = '';
for (const p of permissions) {
  if (!manifest.includes('android:name="' + p + '"')) {
    permissionBlock += '    <uses-permission android:name="' + p + '" />\n';
  }
}
if (permissionBlock) {
  if (!manifest.includes('</manifest>')) fail('</manifest> not found');
  manifest = manifest.replace('</manifest>', permissionBlock + '</manifest>');
}

if (!manifest.includes('.CollectorService')) {
  const serviceXml =
    '        <service\n' +
    '            android:name=".CollectorService"\n' +
    '            android:exported="false"\n' +
    '            android:foregroundServiceType="specialUse">\n' +
    '            <property\n' +
    '                android:name="android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE"\n' +
    '                android:value="Collects market data in the background" />\n' +
    '        </service>\n';
  if (!manifest.includes('</application>')) fail('</application> not found');
  manifest = manifest.replace('</application>', serviceXml + '    </application>');
}

fs.writeFileSync(MANIFEST, manifest);

for (const file of FILES) {
  const from = path.join(NATIVE_DIR, file);
  if (!fs.existsSync(from)) fail('Missing native source ' + from);
  fs.copyFileSync(from, path.join(JAVA_DIR, file));
}

const check = fs.readFileSync(MANIFEST, 'utf8');
if (!check.includes('.CollectorService') || !check.includes('android.permission.FOREGROUND_SERVICE_SPECIAL_USE')) {
  fail('Manifest verification failed');
}
for (const file of FILES) {
  if (!fs.existsSync(path.join(JAVA_DIR, file))) fail('Copy verification failed for ' + file);
}
console.log('Android project patched OK');
