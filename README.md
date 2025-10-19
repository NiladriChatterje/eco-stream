# Screen Sharing Platform

A real-time screen sharing and audio streaming platform built with Next.js, Node.js, Socket.io, and WebRTC.

## Features

- Real-time screen sharing with audio
- WebRTC peer-to-peer connections
- Socket.io signaling server for ICE candidate exchange
- Multi-user support in rooms
- Responsive design
- Modern UI with gradient styling

## Tech Stack

### Frontend
- **Next.js 14** - React framework with App Router
- **TypeScript** - Type-safe code
- **Socket.io Client** - Real-time communication
- **WebRTC** - Peer-to-peer media streaming

### Backend
- **Node.js** - Server runtime
- **Express** - Web framework
- **Socket.io** - WebSocket server for signaling

## Architecture

1. **Signaling Server (Socket.io)**: Handles room management and relays WebRTC signaling messages (offers, answers, ICE candidates)
2. **WebRTC**: Once connections are established, media streams (video and audio) are transferred directly peer-to-peer
3. **Next.js Frontend**: Provides the user interface and manages WebRTC connections

## Setup Instructions

### Prerequisites
- Node.js (v18 or higher)
- npm or yarn

### Backend Setup

1. Navigate to the backend directory:
```bash
cd backend
```

2. Install dependencies:
```bash
npm install
```

3. Start the server:
```bash
npm run dev
```

The signaling server will run on `http://localhost:5000`

### Frontend Setup

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

The frontend will run on `http://localhost:3000`

## Usage

1. **Start Both Servers**: Make sure both backend and frontend servers are running

2. **Create/Join a Room**:
   - Open `http://localhost:3000` in your browser
   - Enter a room ID (e.g., "room-123")
   - Click "Join Room"

3. **Start Screen Sharing**:
   - Click "Start Screen Sharing"
   - Select the screen/window you want to share
   - Your screen will be visible to all users in the room

4. **Join from Another Device**:
   - Open another browser window/tab or use a different device
   - Enter the same room ID
   - You'll see the shared screen

## How It Works

### Connection Flow

1. **Initial Connection**:
   - User connects to Socket.io server
   - User joins a room with a unique room ID

2. **Screen Sharing**:
   - User starts screen capture using `getDisplayMedia()`
   - Local stream is displayed in the UI

3. **Peer Connection Setup**:
   - When a new user joins, Socket.io notifies existing users
   - WebRTC peer connections are created for each user pair
   - Local media tracks are added to peer connections

4. **Signaling**:
   - WebRTC offer/answer exchange happens through Socket.io
   - ICE candidates are exchanged for NAT traversal
   - Once ICE connection is established, media flows peer-to-peer

5. **Media Streaming**:
   - Screen video and audio tracks are sent directly via WebRTC
   - Remote streams are displayed in video elements

## Project Structure

```
streaming-platform/
├── backend/
│   ├── server.js           # Socket.io signaling server
│   ├── package.json        # Backend dependencies
│   └── .gitignore
│
└── frontend/
    ├── app/
    │   ├── layout.tsx      # Root layout
    │   ├── page.tsx        # Main application page
    │   └── globals.css     # Global styles
    ├── lib/
    │   └── webrtc.ts       # WebRTC manager class
    ├── package.json        # Frontend dependencies
    ├── tsconfig.json       # TypeScript config
    ├── next.config.js      # Next.js config
    └── .gitignore
```

## Key Files

- **`backend/server.js`**: Socket.io server for signaling (offer/answer/ICE exchange)
- **`frontend/lib/webrtc.ts`**: WebRTC connection management and media handling
- **`frontend/app/page.tsx`**: Main UI component with room and sharing controls
- **`frontend/app/globals.css`**: Styling for the application

## WebRTC Configuration

The platform uses public STUN servers for NAT traversal:
- `stun:stun.l.google.com:19302`
- `stun:stun1.l.google.com:19302`

For production use, consider adding TURN servers for better connectivity.

## Browser Compatibility

- Chrome/Edge: Full support
- Firefox: Full support
- Safari: Requires HTTPS for screen sharing
- Mobile browsers: Limited screen sharing support

## Security Considerations

- Use HTTPS in production
- Implement authentication and authorization
- Add rate limiting to Socket.io server
- Validate room IDs and user inputs
- Consider implementing TURN servers with authentication

## Future Enhancements

- [ ] Add chat functionality
- [ ] Recording capabilities
- [ ] Screen annotation tools
- [ ] Multiple screen sharing in same room
- [ ] Audio-only mode
- [ ] File sharing
- [ ] Session recording
- [ ] User authentication
- [ ] Room passwords/security

## Troubleshooting

**Connection Issues**:
- Ensure both servers are running
- Check browser console for errors
- Verify firewall settings
- Try using TURN servers if behind strict NAT

**No Video/Audio**:
- Grant browser permissions for screen capture
- Check if audio is enabled in screen sharing dialog
- Verify WebRTC peer connection state

**Performance Issues**:
- Reduce screen resolution
- Close unnecessary applications
- Check network bandwidth
- Consider implementing adaptive bitrate

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.