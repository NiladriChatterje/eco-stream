"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { io, Socket } from "socket.io-client";
import { WebRTCManager } from "@/lib/webrtc";
import {
    MdScreenShare,
    MdStopScreenShare,
    MdContentCopy,
    MdExitToApp,
    MdPeople,
    MdMonitor,
    MdCircle
} from "react-icons/md";

interface Peer {
    id: string;
    name: string;
    isSharing: boolean;
    joinedAt?: string;
}

interface RoomStats {
    userCount: number;
    users: Array<{
        id: string;
        socketId: string;
        isSharing: boolean;
        joinedAt: string;
    }>;
    sharingUser: string | null;
}

export default function RoomPage() {
    const params = useParams();
    const searchParams = useSearchParams();
    const router = useRouter();
    const roomId = params.roomId as string;
    const userName = searchParams.get("name") || `User-${Math.random().toString(36).substr(2, 6)}`;

    const [socket, setSocket] = useState<Socket | null>(null);
    const [userId, setUserId] = useState("");
    const [isConnected, setIsConnected] = useState(false);
    const [isSharing, setIsSharing] = useState(false);
    const [statusMessage, setStatusMessage] = useState("");
    const [peers, setPeers] = useState<Map<string, Peer>>(new Map());
    const [sharingPeerId, setSharingPeerId] = useState<string | null>(null);
    const [roomStats, setRoomStats] = useState<RoomStats | null>(null);
    const [joinNotifications, setJoinNotifications] = useState<string[]>([]);

    const localVideoRef = useRef<HTMLVideoElement>(null);
    const remoteVideoRef = useRef<HTMLVideoElement>(null);
    const webrtcManagerRef = useRef<WebRTCManager | null>(null);

    // Initialize socket connection
    useEffect(() => {
        const newSocket = io("https://localhost:5010", {
            rejectUnauthorized: false // For development with self-signed certificates
        });
        setSocket(newSocket);

        const randomUserId = `${userName}-${Math.random().toString(36).substr(2, 6)}`;
        setUserId(randomUserId);

        return () => {
            newSocket.close();
        };
    }, [userName]);

    // Auto-join room when component mounts
    useEffect(() => {
        if (!socket || !userId) return;

        socket.emit("join-room", roomId, userId);
        setIsConnected(true);
        setStatusMessage(`Joined room: ${roomId}`);

        return () => {
            if (socket && roomId) {
                socket.emit("leave-room", roomId, userId);
            }
        };
    }, [socket, roomId, userId]);

    // Setup socket event listeners
    useEffect(() => {
        if (!socket) return;

        socket.on("connect", () => {
            setStatusMessage("Connected to server");
        });

        socket.on("disconnect", () => {
            setStatusMessage("Disconnected from server");
            setIsConnected(false);
        });

        socket.on("user-joined", (peerId: string) => {
            const message = `${peerId} joined the room`;
            setStatusMessage(message);

            // Add to join notifications with auto-remove after 5 seconds
            setJoinNotifications(prev => [...prev, message]);
            setTimeout(() => {
                setJoinNotifications(prev => prev.filter(notif => notif !== message));
            }, 5000);

            // Add the new user to peers state
            setPeers((prev) => {
                const newPeers = new Map(prev);
                newPeers.set(peerId, {
                    id: peerId,
                    name: peerId,
                    isSharing: false,
                    joinedAt: new Date().toISOString()
                });
                return newPeers;
            });
        });

        socket.on("existing-users", (users: string[]) => {
            setStatusMessage(`${users.length} user(s) already in the room`);

            // Update peers state with existing users
            setPeers((prev) => {
                const newPeers = new Map(prev);
                users.forEach((userId) => {
                    newPeers.set(userId, {
                        id: userId,
                        name: userId,
                        isSharing: false
                    });
                });
                return newPeers;
            });

            // Create peer connections for existing users if we're sharing
            if (webrtcManagerRef.current && isSharing) {
                users.forEach((peerId) => {
                    webrtcManagerRef.current!.createPeerConnection(peerId, true);
                });
            }
        });

        socket.on("user-left", (peerId: string) => {
            const message = `${peerId} left the room`;
            setStatusMessage(message);

            // Add to join notifications with auto-remove after 5 seconds
            setJoinNotifications(prev => [...prev, message]);
            setTimeout(() => {
                setJoinNotifications(prev => prev.filter(notif => notif !== message));
            }, 5000);

            // Remove user from peers state
            setPeers((prev) => {
                const newPeers = new Map(prev);
                newPeers.delete(peerId);
                return newPeers;
            });

            if (webrtcManagerRef.current) {
                webrtcManagerRef.current.removePeer(peerId);
            }

            // If the sharing peer left, clear the remote video
            if (sharingPeerId === peerId) {
                setSharingPeerId(null);
                if (remoteVideoRef.current) {
                    remoteVideoRef.current.srcObject = null;
                }
            }
        });

        socket.on("user-started-sharing", (peerId: string) => {
            console.log(`Received user-started-sharing event for: ${peerId}`);
            setSharingPeerId(peerId);
            setStatusMessage(`${peerId} started sharing their screen`);

            // Initialize WebRTC manager for receiving if not already created
            if (!webrtcManagerRef.current && socket) {
                console.log("Creating WebRTC manager for receiving stream...");
                const manager = new WebRTCManager(
                    socket,
                    userId,
                    (remotePeerId: string, stream: MediaStream) => {
                        console.log("Received remote stream from:", remotePeerId);
                        console.log("Stream tracks:", stream.getTracks().map(t => `${t.kind}: ${t.enabled}, readyState: ${t.readyState}`));

                        if (remoteVideoRef.current) {
                            console.log("Setting remote video srcObject with stream:", stream);
                            remoteVideoRef.current.srcObject = stream;
                            setSharingPeerId(remotePeerId);

                            // Ensure the remote video plays
                            remoteVideoRef.current.play().then(() => {
                                console.log("Remote video started playing successfully");
                            }).catch(err => {
                                console.error("Error playing remote video:", err);
                            });
                        }
                    },
                    (remotePeerId: string) => {
                        console.log("Peer disconnected:", remotePeerId);
                        if (sharingPeerId === remotePeerId && remoteVideoRef.current) {
                            remoteVideoRef.current.srcObject = null;
                            setSharingPeerId(null);
                        }
                    }
                );
                webrtcManagerRef.current = manager;
                console.log("WebRTC manager created for receiving");
            }
        });

        socket.on("user-stopped-sharing", (peerId: string) => {
            if (sharingPeerId === peerId) {
                setSharingPeerId(null);
                if (remoteVideoRef.current) {
                    remoteVideoRef.current.srcObject = null;
                }
            }
            setStatusMessage(`${peerId} stopped sharing`);
        });

        // Handle room users updates from backend
        socket.on("room-users-updated", (users: Array<{ id: string, socketId: string, isSharing: boolean }>) => {
            console.log("Room users updated:", users);
            setPeers((prev) => {
                const newPeers = new Map();
                users.forEach((user) => {
                    if (user.id !== userId) { // Don't include ourselves
                        newPeers.set(user.id, {
                            id: user.id,
                            name: user.id,
                            isSharing: user.isSharing
                        });

                        // Update sharing state
                        if (user.isSharing && !sharingPeerId) {
                            setSharingPeerId(user.id);
                        }
                    }
                });
                return newPeers;
            });

            // If we're sharing, create connections for new users
            if (webrtcManagerRef.current && isSharing) {
                users.forEach((user) => {
                    if (user.id !== userId) {
                        webrtcManagerRef.current!.createPeerConnection(user.id, true);
                    }
                });
            }
        });

        // Handle room statistics updates
        socket.on("room-stats-updated", (stats: RoomStats) => {
            console.log("Room stats updated:", stats);
            setRoomStats(stats);
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
            socket.off("user-started-sharing");
            socket.off("user-stopped-sharing");
            socket.off("room-users-updated");
            socket.off("room-stats-updated");
            socket.off("offer");
            socket.off("answer");
            socket.off("ice-candidate");
        };
    }, [socket, isSharing, roomId, sharingPeerId, userId]);

    const startSharing = async () => {
        if (!socket) {
            setStatusMessage("Not connected to server");
            return;
        }

        try {
            // Initialize WebRTC manager
            const manager = new WebRTCManager(
                socket,
                userId,
                (peerId: string, stream: MediaStream) => {
                    // Handle incoming remote stream from other users
                    console.log("Received remote stream from:", peerId);
                    console.log("Stream tracks:", stream.getTracks().map(t => `${t.kind}: ${t.enabled}, readyState: ${t.readyState}`));

                    if (remoteVideoRef.current) {
                        console.log("Setting remote video srcObject with stream:", stream);
                        remoteVideoRef.current.srcObject = stream;
                        setSharingPeerId(peerId);

                        // Add event listeners for debugging
                        remoteVideoRef.current.onloadedmetadata = () => {
                            console.log("Remote video metadata loaded");
                        };

                        remoteVideoRef.current.oncanplay = () => {
                            console.log("Remote video can play");
                        };

                        // Ensure the remote video plays
                        remoteVideoRef.current.play().then(() => {
                            console.log("Remote video started playing successfully");
                        }).catch(err => {
                            console.error("Error playing remote video:", err);
                        });
                    }
                },
                (peerId: string) => {
                    // Handle peer disconnection
                    console.log("Peer disconnected:", peerId);
                    if (sharingPeerId === peerId && remoteVideoRef.current) {
                        remoteVideoRef.current.srcObject = null;
                        setSharingPeerId(null);
                    }
                }
            );

            webrtcManagerRef.current = manager;

            // Start screen sharing
            console.log("About to call startScreenShare...");
            const stream = await manager.startScreenShare();
            console.log("startScreenShare returned:", stream);

            if (!stream) {
                console.error("ERROR: stream is null!");
                setStatusMessage("Error: Failed to get screen share stream");
                return;
            }

            console.log("Stream obtained successfully!");
            console.log("Stream ID:", stream.id);
            console.log("Stream active:", stream.active);

            const videoTracks = stream.getVideoTracks();
            if (videoTracks.length === 0) {
                console.error("ERROR: No video tracks in stream!");
                setStatusMessage("Error: No video track available");
                return;
            }

            console.log("Video track enabled:", videoTracks[0].enabled);
            console.log("Video track readyState:", videoTracks[0].readyState);

            // CRITICAL FIX: Set isSharing to TRUE first to render the video element
            setIsSharing(true);
            setStatusMessage("Screen sharing started");

            // Wait for React to render the video element
            setTimeout(() => {
                console.log("Attempting to set video srcObject after render...");
                console.log("localVideoRef.current exists:", !!localVideoRef.current);

                if (localVideoRef.current) {
                    // Force clear any existing stream
                    if (localVideoRef.current.srcObject) {
                        const oldStream = localVideoRef.current.srcObject as MediaStream;
                        oldStream.getTracks().forEach(track => track.stop());
                    }

                    // Set the stream
                    localVideoRef.current.srcObject = stream;
                    localVideoRef.current.muted = true;

                    // Force load and play
                    localVideoRef.current.onloadedmetadata = async () => {
                        console.log("Video metadata loaded!");
                        console.log("Dimensions:", localVideoRef.current?.videoWidth, "x", localVideoRef.current?.videoHeight);
                        try {
                            if (localVideoRef.current) {
                                await localVideoRef.current.play();
                                console.log("Video is playing!");
                            }
                        } catch (e) {
                            console.error("Play failed:", e);
                        }
                    };

                    // Try to play immediately
                    localVideoRef.current.play()
                        .then(() => console.log("Immediate play successful!"))
                        .catch(err => console.warn("Immediate play failed, waiting for metadata:", err));
                } else {
                    console.error("ERROR: Video element still not found after timeout!");
                }
            }, 100); // Give React 100ms to render the video element

            // Notify others that we started sharing
            socket.emit("start-sharing", roomId, userId);

            // Create peer connections for existing users AFTER a small delay
            // This ensures the stream is fully set up before creating connections
            setTimeout(async () => {
                console.log("Creating peer connections for existing users...");
                const peerIds = Array.from(peers.keys());
                console.log("Peer IDs to connect to:", peerIds);

                for (const peerId of peerIds) {
                    console.log(`Creating peer connection for ${peerId}...`);
                    await manager.createPeerConnection(peerId, true);
                }

                console.log("All peer connections created!");
            }, 500);

            // Handle when user stops sharing via browser UI
            stream.getVideoTracks()[0].addEventListener("ended", () => {
                stopSharing();
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

        if (socket) {
            socket.emit("stop-sharing", roomId, userId);
        }

        setIsSharing(false);
        setStatusMessage("Screen sharing stopped");
    };

    const leaveRoom = () => {
        if (isSharing) {
            stopSharing();
        }
        router.push("/");
    };

    const copyRoomLink = () => {
        const link = `${window.location.origin}/room/${roomId}`;
        navigator.clipboard.writeText(link);
        setStatusMessage("Room link copied to clipboard!");
    };

    // Format time since joined
    const formatTimeSince = (timestamp: string) => {
        const now = new Date();
        const joined = new Date(timestamp);
        const diffMs = now.getTime() - joined.getTime();
        const diffMins = Math.floor(diffMs / 60000);

        if (diffMins < 1) return "just now";
        if (diffMins < 60) return `${diffMins}m ago`;
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `${diffHours}h ago`;
        return `${Math.floor(diffHours / 24)}d ago`;
    };

    return (
        <div className="container">
            <div className="header">
                <h1 style={{ display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'center' }}>
                    <MdMonitor size={36} style={{ color: '#3b82f6' }} />
                    Room: {roomId}
                </h1>
                <p>Connected as: {userName}</p>
            </div>

            <div className="main-content">
                {statusMessage && (
                    <div
                        className={`status-message ${statusMessage.includes("Failed") || statusMessage.includes("Error")
                            ? "status-error"
                            : statusMessage.includes("started") ||
                                statusMessage.includes("copied")
                                ? "status-success"
                                : "status-info"
                            }`}
                    >
                        {statusMessage}
                    </div>
                )}

                {/* Join/Leave Notifications */}
                {joinNotifications.length > 0 && (
                    <div className="notifications-container">
                        {joinNotifications.map((notification, index) => (
                            <div key={index} className="notification-item">
                                {notification}
                            </div>
                        ))}
                    </div>
                )}

                <div className="control-panel">
                    <div className="button-row">
                        {!isSharing ? (
                            <button onClick={startSharing} className="button-success" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <MdScreenShare size={20} />
                                Start Screen Sharing
                            </button>
                        ) : (
                            <button onClick={stopSharing} className="button-danger" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <MdStopScreenShare size={20} />
                                Stop Sharing
                            </button>
                        )}
                        <button onClick={copyRoomLink} className="button-secondary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <MdContentCopy size={18} />
                            Copy Room Link
                        </button>
                        <button onClick={leaveRoom} className="button-danger" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <MdExitToApp size={20} />
                            Leave Room
                        </button>
                    </div>

                    <div className="peers-section">
                        <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <MdPeople size={22} />
                            People in Room ({roomStats?.userCount || peers.size + 1})
                        </h3>
                        <div className="peer-list">
                            <div className="peer-item peer-you">
                                <div className="peer-info">
                                    <span className="peer-name">{userName} (You)</span>
                                    <span className="peer-status">
                                        {isSharing && (
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <MdScreenShare size={14} />
                                                Sharing
                                            </span>
                                        )}
                                        <MdCircle size={10} className="online-indicator" style={{ color: '#10b981' }} />
                                    </span>
                                </div>
                            </div>
                            {Array.from(peers.values()).map((peer) => (
                                <div key={peer.id} className="peer-item">
                                    <div className="peer-info">
                                        <span className="peer-name">{peer.name}</span>
                                        <span className="peer-status">
                                            {peer.isSharing && (
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <MdScreenShare size={14} />
                                                    Sharing
                                                </span>
                                            )}
                                            <MdCircle size={10} className="online-indicator" style={{ color: '#10b981' }} />
                                            {peer.joinedAt && (
                                                <span className="join-time">
                                                    {formatTimeSince(peer.joinedAt)}
                                                </span>
                                            )}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Room Statistics */}
                        {roomStats && (
                            <div className="room-stats">
                                <div className="stats-item">
                                    <span>Total Users: {roomStats.userCount}</span>
                                </div>
                                {roomStats.sharingUser && (
                                    <div className="stats-item">
                                        <span>Currently Sharing: {roomStats.sharingUser}</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                <div className="video-section">
                    {isSharing && (
                        <div className="video-container-large">
                            <div className="video-wrapper">
                                <div className="video-label">Your Screen (Preview)</div>
                                <video
                                    ref={localVideoRef}
                                    autoPlay
                                    muted
                                    playsInline
                                    controls
                                    style={{
                                        width: '100%',
                                        height: '100%',
                                        minHeight: '400px',
                                        maxHeight: '600px',
                                        objectFit: 'contain',
                                        backgroundColor: '#1a1a1a',
                                        border: '2px solid #333'
                                    }}
                                    onLoadedMetadata={(e) => {
                                        console.log("Local video metadata loaded, dimensions:", e.currentTarget.videoWidth, "x", e.currentTarget.videoHeight);
                                        e.currentTarget.play().catch(err => console.error("Play error:", err));
                                    }}
                                />
                            </div>
                        </div>
                    )}                    {sharingPeerId && !isSharing && (
                        <div className="video-container-large">
                            <div className="video-wrapper">
                                <div className="video-label">
                                    {peers.get(sharingPeerId)?.name || sharingPeerId}'s Screen
                                </div>
                                <video
                                    ref={remoteVideoRef}
                                    autoPlay
                                    playsInline
                                    controls
                                    style={{
                                        width: '100%',
                                        height: '100%',
                                        minHeight: '400px',
                                        maxHeight: '600px',
                                        objectFit: 'contain',
                                        backgroundColor: '#1a1a1a',
                                        border: '2px solid #333'
                                    }}
                                    onLoadedMetadata={(e) => {
                                        console.log("Remote video metadata loaded, dimensions:", e.currentTarget.videoWidth, "x", e.currentTarget.videoHeight);
                                        e.currentTarget.play().catch(err => console.error("Play error:", err));
                                    }}
                                />
                            </div>
                        </div>
                    )}

                    {!isSharing && !sharingPeerId && (
                        <div className="waiting-message">
                            <MdMonitor size={80} style={{ color: '#64748b', marginBottom: '20px' }} />
                            <h2>Waiting for someone to share their screen...</h2>
                            <p>Click "Start Screen Sharing" to broadcast your screen to everyone in this room</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}