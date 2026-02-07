const fs = require('fs');
const path = require('path');

// Read the template service worker file
const templatePath = path.join(__dirname, '../public/firebase-messaging-sw.js');
let swContent = fs.readFileSync(templatePath, 'utf8');

// Replace placeholders with actual environment variables
swContent = swContent
    .replace('__FIREBASE_API_KEY__', process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '')
    .replace('__FIREBASE_AUTH_DOMAIN__', process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || '')
    .replace('__FIREBASE_PROJECT_ID__', process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '')
    .replace('__FIREBASE_STORAGE_BUCKET__', process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '')
    .replace('__FIREBASE_MESSAGING_SENDER_ID__', process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '')
    .replace('__FIREBASE_APP_ID__', process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '');

// Write the processed file to the public directory
const outputPath = path.join(__dirname, '../public/firebase-messaging-sw.js');
fs.writeFileSync(outputPath, swContent, 'utf8');

console.log('✅ Firebase Service Worker configured with environment variables');
