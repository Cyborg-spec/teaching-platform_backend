const admin = require('firebase-admin');
const serviceAccount = require('./src/config/serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

async function run() {
  const lessons = await db.collection('lessons').get();
  console.log("Lessons count:", lessons.size);
  if (lessons.size > 0) {
    console.log("First lesson data:", lessons.docs[0].data());
  }
}
run().then(() => process.exit(0)).catch(console.error);
