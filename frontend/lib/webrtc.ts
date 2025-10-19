import { Socket } from "socket.io-client";

// WebRTC configuration
const configuration: RTCConfiguration = {
    iceServers: [
        {
            urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"],
        },
    ],
};

export class WebRTCManager {
    private peerConnections: Map<string, RTCPeerConnection> = new Map();
    private socket: Socket;
    private localStream: MediaStream | null = null;
    private onRemoteStream: (peerId: string, stream: MediaStream) => void;
    private onPeerDisconnected: (peerId: string) => void;

    constructor(
        socket: Socket,
        onRemoteStream: (peerId: string, stream: MediaStream) => void,
        onPeerDisconnected: (peerId: string) => void
    ) {
        this.socket = socket;
        this.onRemoteStream = onRemoteStream;
        this.onPeerDisconnected = onPeerDisconnected;
    }

    // Start screen sharing with audio
    async startScreenShare(): Promise<MediaStream> {
        try {
            // Get screen share with audio
            const screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    cursor: "always",
                } as MediaTrackConstraints,
                audio: true,
            });

            this.localStream = screenStream;

            // Handle when user stops sharing via browser UI
            screenStream.getVideoTracks()[0].addEventListener("ended", () => {
                this.stopScreenShare();
            });

            return screenStream;
        } catch (error) {
            console.error("Error starting screen share:", error);
            throw error;
        }
    }

    // Stop screen sharing
    stopScreenShare() {
        if (this.localStream) {
            this.localStream.getTracks().forEach((track) => track.stop());
            this.localStream = null;
        }

        // Close all peer connections
        this.peerConnections.forEach((pc) => pc.close());
        this.peerConnections.clear();
    }

    // Create peer connection for a remote peer
    async createPeerConnection(peerId: string, isInitiator: boolean) {
        const peerConnection = new RTCPeerConnection(configuration);
        this.peerConnections.set(peerId, peerConnection);

        // Add local stream tracks to peer connection
        if (this.localStream) {
            this.localStream.getTracks().forEach((track) => {
                peerConnection.addTrack(track, this.localStream!);
            });
        }

        // Handle ICE candidates
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.socket.emit("ice-candidate", {
                    to: peerId,
                    candidate: event.candidate,
                    from: this.socket.id,
                });
            }
        };

        // Handle remote stream
        peerConnection.ontrack = (event) => {
            console.log("Received remote track:", event.track.kind);
            if (event.streams && event.streams[0]) {
                this.onRemoteStream(peerId, event.streams[0]);
            }
        };

        // Handle connection state changes
        peerConnection.onconnectionstatechange = () => {
            console.log(
                `Connection state with ${peerId}:`,
                peerConnection.connectionState
            );
            if (
                peerConnection.connectionState === "disconnected" ||
                peerConnection.connectionState === "failed" ||
                peerConnection.connectionState === "closed"
            ) {
                this.removePeer(peerId);
            }
        };

        // Handle ICE connection state changes
        peerConnection.oniceconnectionstatechange = () => {
            console.log(
                `ICE connection state with ${peerId}:`,
                peerConnection.iceConnectionState
            );
        };

        // If initiator, create and send offer
        if (isInitiator) {
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);

            this.socket.emit("offer", {
                to: peerId,
                offer: offer,
                from: this.socket.id,
            });
        }

        return peerConnection;
    }

    // Handle received offer
    async handleOffer(peerId: string, offer: RTCSessionDescriptionInit) {
        let peerConnection = this.peerConnections.get(peerId);

        if (!peerConnection) {
            peerConnection = await this.createPeerConnection(peerId, false);
        }

        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        this.socket.emit("answer", {
            to: peerId,
            answer: answer,
            from: this.socket.id,
        });
    }

    // Handle received answer
    async handleAnswer(peerId: string, answer: RTCSessionDescriptionInit) {
        const peerConnection = this.peerConnections.get(peerId);
        if (peerConnection) {
            await peerConnection.setRemoteDescription(
                new RTCSessionDescription(answer)
            );
        }
    }

    // Handle received ICE candidate
    async handleIceCandidate(peerId: string, candidate: RTCIceCandidateInit) {
        const peerConnection = this.peerConnections.get(peerId);
        if (peerConnection) {
            try {
                await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (error) {
                console.error("Error adding ICE candidate:", error);
            }
        }
    }

    // Remove peer connection
    removePeer(peerId: string) {
        const peerConnection = this.peerConnections.get(peerId);
        if (peerConnection) {
            peerConnection.close();
            this.peerConnections.delete(peerId);
            this.onPeerDisconnected(peerId);
        }
    }

    // Get all connected peer IDs
    getConnectedPeers(): string[] {
        return Array.from(this.peerConnections.keys());
    }

    // Clean up all connections
    cleanup() {
        this.stopScreenShare();
        this.peerConnections.forEach((pc) => pc.close());
        this.peerConnections.clear();
    }
}