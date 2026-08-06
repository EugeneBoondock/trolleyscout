import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const packageName = 'za.co.trolleyscout.trolley_scout';
const aabPath = path.resolve('mobile/build/app/outputs/bundle/consumerRelease/app-consumer-release.aab');
const pubspecPath = path.resolve('mobile/pubspec.yaml');

/// The release name shown in the console. Read from the pubspec rather than
/// typed in, because a hardcoded name once shipped a bundle labelled as the
/// previous release.
function releaseName() {
  const pubspec = fs.readFileSync(pubspecPath, 'utf8');
  const version = /^version:\s*(\S+)/m.exec(pubspec);
  if (!version) throw new Error('No version found in mobile/pubspec.yaml');
  return version[1];
}

/// A bundle older than the version that names it is a bundle from a previous
/// build. Uploading one ships yesterday's app under today's version, which is
/// worse than failing here.
function assertBundleIsFresh() {
  if (!fs.existsSync(aabPath)) {
    throw new Error(
      `No consumer bundle at ${aabPath}.\n` +
      'Build it first: flutter build appbundle --flavor consumer --release',
    );
  }
  const builtAt = fs.statSync(aabPath).mtimeMs;
  const versionedAt = fs.statSync(pubspecPath).mtimeMs;
  if (builtAt < versionedAt) {
    throw new Error(
      `The consumer bundle is older than the version bump in pubspec.yaml.\n` +
      `  bundle:  ${new Date(builtAt).toISOString()}\n` +
      `  pubspec: ${new Date(versionedAt).toISOString()}\n` +
      'Rebuild it: flutter build appbundle --flavor consumer --release',
    );
  }
}

async function run() {
  assertBundleIsFresh();
  console.log('Publishing', releaseName(), 'from', aabPath);
  console.log('Fetching gcloud access token...');
  let token;
  try {
    token = execSync('gcloud auth application-default print-access-token', { encoding: 'utf8' }).trim();
  } catch (e) {
    token = execSync('gcloud auth print-access-token', { encoding: 'utf8' }).trim();
  }
  console.log('Token length:', token.length);

  console.log('Creating edit for package:', packageName);
  const createEditRes = await fetch(
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/edits`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-goog-user-project': 'entropsuite',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    }
  );

  const editData = await createEditRes.json();
  console.log('Create Edit Response:', editData);
  if (!editData.id) {
    throw new Error('Failed to create edit: ' + JSON.stringify(editData));
  }

  const editId = editData.id;
  console.log('Got Edit ID:', editId);

  console.log('AAB size in bytes:', fs.statSync(aabPath).size);

  // curl streams the 84MB bundle from disk; buffering it through fetch gets
  // the process killed for memory.
  console.log('Uploading bundle to Google Play Console...');
  const uploadRaw = execSync(
    [
      'curl -s -X POST',
      `-H "Authorization: Bearer ${token}"`,
      '-H "x-goog-user-project: entropsuite"',
      '-H "Content-Type: application/octet-stream"',
      `--data-binary "@${aabPath}"`,
      `"https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/${packageName}/edits/${editId}/bundles?uploadType=media"`,
    ].join(' '),
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
  );

  const uploadData = JSON.parse(uploadRaw);
  console.log('Upload Response:', uploadData);
  if (!uploadData.versionCode) {
    throw new Error('Failed to upload bundle: ' + JSON.stringify(uploadData));
  }

  const versionCode = uploadData.versionCode;
  console.log('Uploaded Version Code:', versionCode);

  console.log('Assigning bundle to closed testing track (alpha)...');
  const trackRes = await fetch(
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/edits/${editId}/tracks/alpha`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-goog-user-project': 'entropsuite',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        track: 'alpha',
        releases: [
          {
            name: releaseName(),
            versionCodes: [versionCode.toString()],
            status: 'completed',
            releaseNotes: [
              {
                language: 'en-US',
                text: process.env.RELEASE_NOTES
                  ?? 'Fitting room: search every shop by name, tap a garment to save it or add it to your basket, pin the fits you love and see what each one is worth.',
              },
            ],
          },
        ],
      }),
    }
  );

  const trackData = await trackRes.json();
  console.log('Track Response:', trackData);

  console.log('Committing edit...');
  const commitRes = await fetch(
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/edits/${editId}:commit`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-goog-user-project': 'entropsuite',
      },
    }
  );

  const commitData = await commitRes.json();
  console.log('Commit Response:', commitData);
  console.log('Successfully published release to Google Play Console via CLI!');
}

run().catch((err) => {
  console.error('Error publishing to Google Play Console:', err);
  process.exit(1);
});
