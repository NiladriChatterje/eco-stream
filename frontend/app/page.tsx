"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MdMonitor, MdPerson, MdLogin } from "react-icons/md";

export default function Home() {
    const [roomId, setRoomId] = useState("");
    const [userName, setUserName] = useState("");
    const router = useRouter();

    const joinRoom = () => {
        if (!roomId.trim()) {
            alert("Please enter a room ID");
            return;
        }

        const finalUserName = userName.trim() || `User-${Math.random().toString(36).substr(2, 6)}`;

        // Redirect to room page
        router.push(`/room/${roomId}?name=${encodeURIComponent(finalUserName)}`);
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            joinRoom();
        }
    };

    return (
        <div className="container">
            <div className="header">
                <h1 style={{ display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'center' }}>
                    <MdMonitor size={42} style={{ color: '#3b82f6' }} />
                    Screen Sharing Platform
                </h1>
                <p>WebRTC-based real-time screen and audio streaming</p>
            </div>

            <div className="main-content">
                <div className="welcome-section">
                    <h2>Welcome to the Streaming Platform</h2>
                    <p>Enter a room ID to join or create a new room</p>

                    <div className="control-panel">
                        <div className="input-group">
                            <MdPerson size={20} style={{ color: '#94a3b8', marginLeft: '12px' }} />
                            <input
                                type="text"
                                placeholder="Your Name (optional)"
                                value={userName}
                                onChange={(e) => setUserName(e.target.value)}
                                onKeyPress={handleKeyPress}
                                style={{ paddingLeft: '8px' }}
                            />
                        </div>

                        <div className="input-group">
                            <input
                                type="text"
                                placeholder="Enter Room ID"
                                value={roomId}
                                onChange={(e) => setRoomId(e.target.value)}
                                onKeyPress={handleKeyPress}
                            />
                            <button onClick={joinRoom} disabled={!roomId.trim()} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <MdLogin size={20} />
                                Join Room
                            </button>
                        </div>

                        <div className="info-box">
                            <h3>How it works:</h3>
                            <ol>
                                <li>Enter a room ID (create your own or join existing)</li>
                                <li>Share the room ID with others</li>
                                <li>Start screen sharing to broadcast to everyone in the room</li>
                                <li>Others will see your screen in real-time</li>
                            </ol>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
