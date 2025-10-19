# HTTPS Setup for Screen Sharing Platform

This document explains the HTTPS setup for the streaming platform to enable `getDisplayMedia()` screen sharing functionality.

## Overview

The `getDisplayMedia()` API requires a secure context (HTTPS) to function properly. This setup configures both the frontend (Next.js) and backend (Express + Socket.io) servers to use HTTPS with self-signed SSL certificates.

## What Was Done

### 1. SSL Certificate Generation

- Installed the `selfsigned` npm package in the backend
- Created `backend/generate-proper-cert.js` to generate self-signed SSL certificates
- Generated `key.pem` (private key) and `cert.pem` (certificate) files
- Copied certificates to both `backend/` and `frontend/` directories

### 2. Backend Server (Express + Socket.io)

**File: `backend/server.js`**

Changes made:
- Changed from `http` to `https` module
- Added SSL certificate loading:
  ```javascript
  const options = {
      key: fs.readFileSync("key.pem"),
      cert: fs.readFileSync("cert.pem")
  };
  ```
- Updated server creation: `https.createServer(options, app)`
- Updated CORS origin from `http://localhost:3000` to `https://localhost:3000`

The backend now runs on: **https://localhost:5010**

### 3. Frontend Server (Next.js)

**File: `frontend/server.js`** (new file)

Created a custom Next.js server that:
- Uses HTTPS with the SSL certificates
- Runs on port 3000
- Handles all Next.js requests through HTTPS

**File: `frontend/package.json`**

Updated the dev script:
```json
"dev": "node server.js"
```

The frontend now runs on: **https://localhost:3000**

### 4. Socket.io Connection Update

**File: `frontend/app/room/[roomId]/page.tsx`**

Changed the socket connection from:
```javascript
io("http://localhost:5010")
```
to:
```javascript
io("https://localhost:5010")
```

### 5. Video srcObject Debugging

Added comprehensive debugging to help troubleshoot video display issues:
- Logs when stream is set to video element
- Logs track information (kind, enabled, readyState)
- Added event listeners for `onloadedmetadata` and `oncanplay`
- Enhanced error logging for video playback issues

## How to Use

### Step 1: Generate Certificates (if needed)

If you need to regenerate certificates:

```bash
cd backend
node generate-proper-cert.js
```

Then copy to frontend:
```bash
copy key.pem ..\frontend\key.pem
copy cert.pem ..\frontend\cert.pem
```

### Step 2: Start the Backend Server

```bash
cd backend
npm start
```

The backend server will start on **https://localhost:5010**

### Step 3: Start the Frontend Server

```bash
cd frontend
npm run dev
```

The frontend server will start on **https://localhost:3000**

### Step 4: Access the Application

1. Open your browser and navigate to: **https://localhost:3000**
2. You will see a browser warning about the self-signed certificate
3. Click "Advanced" and then "Proceed to localhost (unsafe)" or similar option
4. The application will load

### Step 5: Accept Certificate for Backend

When you join a room and try to share your screen:
1. The browser may show another certificate warning for the backend (wss://localhost:5010)
2. Open **https://localhost:5010** in a new tab
3. Accept the certificate warning
4. Return to your application tab
5. Screen sharing should now work

## Browser Certificate Warnings

Since we're using self-signed certificates, browsers will show security warnings. This is expected for development. You need to:

1. **Accept the certificate for https://localhost:3000** (frontend)
2. **Accept the certificate for https://localhost:5010** (backend)

You only need to do this once per browser session.

## Troubleshooting

### Screen Sharing Not Working

1. **Check Console Logs**: Open browser DevTools (F12) and check the console for:
   - Stream creation logs
   - Video element srcObject logs
   - Track information (kind, enabled, readyState)
   - Any error messages

2. **Certificate Issues**: 
   - Make sure you've accepted certificates for both localhost:3000 and localhost:5010
   - Try visiting https://localhost:5010 directly and accepting the certificate

3. **Browser Permissions**:
   - Ensure you've granted screen sharing permissions when prompted
   - Check browser settings if permissions were previously denied

4. **Video Element Issues**:
   - Check if `srcObject` is being set (look for "Setting local video srcObject" in console)
   - Check if metadata is loaded (look for "Local video metadata loaded")
   - Check if video can play (look for "Local video can play")

### Common Error Messages

- **"getDisplayMedia is not defined"**: HTTPS is not properly configured
- **"User denied permission"**: User clicked "Cancel" on screen share prompt
- **"Certificate error"**: Need to accept self-signed certificate in browser
- **"Connection refused"**: Backend server is not running

## Production Deployment

For production, you should:

1. Use a proper SSL certificate from a Certificate Authority (Let's Encrypt, etc.)
2. Update the certificate paths in server configuration
3. Use environment variables for URLs instead of hardcoded localhost
4. Configure proper CORS origins for your production domain

## Files Modified/Created

### Created:
- `backend/generate-proper-cert.js` - Certificate generation script
- `backend/key.pem` - Private key
- `backend/cert.pem` - SSL certificate
- `frontend/server.js` - Custom HTTPS server for Next.js
- `frontend/key.pem` - Private key (copy)
- `frontend/cert.pem` - SSL certificate (copy)
- `README-HTTPS-SETUP.md` - This file

### Modified:
- `backend/server.js` - Updated to use HTTPS
- `frontend/package.json` - Updated dev script
- `frontend/app/room/[roomId]/page.tsx` - Updated socket URL and added debugging

## Security Notes

⚠️ **Important**: The self-signed certificates in this setup are for **development only**. 

- Never use self-signed certificates in production
- Never commit certificates to version control (add to .gitignore)
- The current setup allows `getDisplayMedia()` to work locally for testing

## Additional Information

- The `getDisplayMedia()` API requires HTTPS (or localhost) as a security measure
- This prevents malicious websites from capturing screen content without user awareness
- The browser will always show a permission prompt before allowing screen sharing
- Users can see which tab/window/screen they're sharing through the browser's UI