"use client";

import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { WebRTCManager } from "@/lib/webrtc";

export default function Home() {
    const [socket, setSocket] = useState<Socket | null>(null);
    const [roomId, setRoomId] = useState("");
    const [userId, setUserId] = useState("");
    const [isConnected, setIsConnected] = useState(false);
    const [isSharing, setIsSharing] = useState(false);
    const [statusMessage, setStatusMessage] = useState("");
    const [connectedPeers, setConnectedPeers] = useState<string[]>([]);

    const localVideoRef = useRef<HTMLVideoElement>(null);
    const remoteVideosRef = useRef<Map<string, HTMLVideoElement>>(new Map());
    const webrtcManagerRef = useRef<WebRTCManager | null>(null);

    // Initialize socket connection
    useEffect(() => {
        const newSocket = io("http://localhost:5010");
        setSocket(newSocket);

        // Generate random user ID
        const randomUserId = `user-${Math.random().toString(36).substr(2, 9)}`;
        setUserId(randomUserId);

        return () => {
            newSocket.close();
        };
    }, []);

    // Setup socket event listeners
    useEffect(() => {
        if (!socket) return;

        socket.on("connect", () => {
            setStatusMessage("Connected to signaling server");
        });

        socket.on("disconnect", () => {
            setStatusMessage("Disconnected from signaling server");
            setIsConnected(false);
        });

        socket.on("user-joined", (peerId: string) => {
            setStatusMessage(`User ${peerId} joined the room`);
            setConnectedPeers((prev) => [...prev, peerId]);

            // Create peer connection for new user
            if (webrtcManagerRef.current && isSharing) {
                webrtcManagerRef.current.createPeerConnection(peerId, true);
            }
        });

        socket.on("existing-users", (users: string[]) => {
            setConnectedPeers(users);
            setStatusMessage(`Found ${users.length} user(s) in the room`);

            // Create peer connections for existing users
            if (webrtcManagerRef.current && isSharing) {
                users.forEach((peerId) => {
                    webrtcManagerRef.current!.createPeerConnection(peerId, true);
                });
            }
        });

        socket.on("user-left", (peerId: string) => {
            setStatusMessage(`User ${peerId} left the room`);
            setConnectedPeers((prev) => prev.filter((id) => id !== peerId));

            if (webrtcManagerRef.current) {
                webrtcManagerRef.current.removePeer(peerId);
            }

            // Remove remote video element
            const videoElement = remoteVideosRef.current.get(peerId);
            if (videoElement) {
                videoElement.srcObject = null;
                remoteVideosRef.current.delete(peerId);
            }
        });

        socket.on(
            "offer",
            async (data: { offer: RTCSessionDescriptionInit; from: string }) => {
                if (webrtcManagerRef.current) {
                    await webrtcManagerRef.current.handleOffer(data.from, data.offer);
                }
            }
        );

        socket.on(
            "answer",
            async (data: { answer: RTCSessionDescriptionInit; from: string }) => {
                if (webrtcManagerRef.current) {
                    await webrtcManagerRef.current.handleAnswer(data.from, data.answer);
                }
            }
        );

        socket.on(
            "ice-candidate",
            async (data: { candidate: RTCIceCandidateInit; from: string }) => {
                if (webrtcManagerRef.current) {
                    await webrtcManagerRef.current.handleIceCandidate(
                        data.from,
                        data.candidate
                    );
                }
            }
        );

        return () => {
            socket.off("connect");
            socket.off("disconnect");
            socket.off("user-joined");
            socket.off("existing-users");
            socket.off("user-left");
            socket.off("offer");
            socket.off("answer");
            socket.off("ice-candidate");
        };
    }, [socket, isSharing]);

    const joinRoom = () => {
        if (!socket || !roomId.trim()) {
            setStatusMessage("Please enter a room ID");
            return;
        }

        socket.emit("join-room", roomId, userId);
        setIsConnected(true);
        setStatusMessage(`Joined room: ${roomId}`);
    };

    const leaveRoom = () => {
        if (!socket || !roomId) return;

        socket.emit("leave-room", roomId, userId);
        setIsConnected(false);
        setConnectedPeers([]);
        setStatusMessage("Left the room");

        if (isSharing) {
            stopSharing();
        }
    };

    const startSharing = async () => {
        if (!socket) {
            setStatusMessage("Not connected to server");
            return;
        }

        if (!isConnected) {
            setStatusMessage("Please join a room first");
            return;
        }

        try {
            // Initialize WebRTC manager
            const manager = new WebRTCManager(
                socket,
                (peerId: string, stream: MediaStream) => {
                    // Handle remote stream
                    const videoElement = document.getElementById(
                        `remote-video-${peerId}`
                    ) as HTMLVideoElement;
                    if (videoElement) {
                        videoElement.srcObject = stream;
                        remoteVideosRef.current.set(peerId, videoElement);
                    }
                },
                (peerId: string) => {
                    // Handle peer disconnection
                    const videoElement = remoteVideosRef.current.get(peerId);
                    if (videoElement) {
                        videoElement.srcObject = null;
                        remoteVideosRef.current.delete(peerId);
                    }
                }
            );

            webrtcManagerRef.current = manager;

            // Start screen sharing
            const stream = await manager.startScreenShare();

            // Display local stream
            if (localVideoRef.current) {
                localVideoRef.current.srcObject = stream;
            }

            setIsSharing(true);
            setStatusMessage("Screen sharing started");

            // Create peer connections for existing users
            connectedPeers.forEach((peerId) => {
                manager.createPeerConnection(peerId, true);
            });
        } catch (error) {
            console.error("Error starting screen share:", error);
            setStatusMessage("Failed to start screen sharing");
        }
    };

    const stopSharing = () => {
        if (webrtcManagerRef.current) {
            webrtcManagerRef.current.cleanup();
            webrtcManagerRef.current = null;
        }

        if (localVideoRef.current) {
            localVideoRef.current.srcObject = null;
        }

        setIsSharing(false);
        setStatusMessage("Screen sharing stopped");
    };

    return (
        <div className="container">
            <div className="header">
                <h1>🎥 Screen Sharing Platform</h1>
                <p>WebRTC-based real-time screen and audio streaming</p>
            </div>

            <div className="main-content">
                {statusMessage && (
                    <div
                        className={`status-message ${statusMessage.includes("Failed") || statusMessage.includes("Error")
                            ? "status-error"
                            : statusMessage.includes("Connected") ||
                                statusMessage.includes("started")
                                ? "status-success"
                                : "status-info"
                            }`}
                    >
                        {statusMessage}
                    </div>
                )}

                <div className="control-panel">
                    <div>
                        <strong>Your ID:</strong> {userId}
                    </div>

                    <div className="input-group">
                        <input
                            type="text"
                            placeholder="Enter Room ID"
                            value={roomId}
                            onChange={(e) => setRoomId(e.target.value)}
                            disabled={isConnected}
                        />
                        {!isConnected ? (
                            <button onClick={joinRoom} disabled={!roomId.trim()}>
                                Join Room
                            </button>
                        ) : (
                            <button onClick={leaveRoom} className="button-danger">
                                Leave Room
                            </button>
                        )}
                    </div>

                    {isConnected && (
                        <div className="input-group">
                            {!isSharing ? (
                                <button onClick={startSharing} className="button-success">
                                    Start Screen Sharing
                                </button>
                            ) : (
                                <button onClick={stopSharing} className="button-danger">
                                    Stop Sharing
                                </button>
                            )}
                        </div>
                    )}

                    {connectedPeers.length > 0 && (
                        <div>
                            <strong>Connected Peers ({connectedPeers.length}):</strong>
                            <div className="peer-list">
                                {connectedPeers.map((peer) => (
                                    <div key={peer} className="peer-item">
                                        {peer}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="video-container">
                    {isSharing && (
                        <div className="video-wrapper">
                            <div className="video-label">Your Screen</div>
                            <video ref={localVideoRef} autoPlay muted playsInline />
                        </div>
                    )}

                    {connectedPeers.map((peerId) => (
                        <div key={peerId} className="video-wrapper">
                            <div className="video-label">{peerId}</div>
                            <video
                                id={`remote-video-${peerId}`}
                                autoPlay
                                playsInline
                            />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
