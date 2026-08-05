import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const packageName = 'za.co.trolleyscout.trolley_scout';
const aabPath = path.resolve('mobile/build/app/outputs/bundle/consumerRelease/app-consumer-release.aab');

async function run() {
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
            name: '1.24.3+78',
            versionCodes: [versionCode.toString()],
            status: 'completed',
            releaseNotes: [
              {
                language: 'en-US',
                text: 'Tap any healthy food for nutrition facts and budget tips. Cleaner marketplace navigation with a collapsible category tree.',
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
