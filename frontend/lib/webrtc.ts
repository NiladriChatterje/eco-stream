import { Socket } from "socket.io-client";

// WebRTC configuration with STUN servers
const configuration: RTCConfiguration = {
    iceServers: [
        {
            urls: [
                "stun:stun.l.google.com:19302",
                "stun:stun1.l.google.com:19302",
                "stun:stun2.l.google.com:19302",
            ],
        },
    ],
    iceCandidatePoolSize: 10,
};

export class WebRTCManager {
    private peerConnections: Map<string, RTCPeerConnection> = new Map();
    private socket: Socket;
    private localStream: MediaStream | null = null;
    private myUserId: string;
    private onRemoteStream: (peerId: string, stream: MediaStream) => void;
    private onPeerDisconnected: (peerId: string) => void;
    private pendingCandidates: Map<string, RTCIceCandidateInit[]> = new Map();

    constructor(
        socket: Socket,
        myUserId: string,
        onRemoteStream: (peerId: string, stream: MediaStream) => void,
        onPeerDisconnected: (peerId: string) => void
    ) {
        this.socket = socket;
        this.myUserId = myUserId;
        this.onRemoteStream = onRemoteStream;
        this.onPeerDisconnected = onPeerDisconnected;
    }

    // Start screen sharing with audio
    async startScreenShare(): Promise<MediaStream> {
        try {
            console.log("Starting screen share...");

            // Request screen share with system audio
            const screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    cursor: "always",
                    displaySurface: "monitor",
                } as MediaTrackConstraints,
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    sampleRate: 44100,
                } as MediaTrackConstraints,
            });

            this.localStream = screenStream;

            // Handle when user stops sharing via browser UI
            const videoTrack = screenStream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.addEventListener("ended", () => {
                    console.log("Screen sharing ended by user");
                    this.stopScreenShare();
                });
            }

            console.log("Screen share started successfully");
            console.log("Video tracks:", screenStream.getVideoTracks().length);
            console.log("Audio tracks:", screenStream.getAudioTracks().length);

            return screenStream;
        } catch (error) {
            console.error("Error starting screen share:", error);
            throw error;
        }
    }

    // Stop screen sharing
    stopScreenShare() {
        console.log("Stopping screen share...");

        if (this.localStream) {
            this.localStream.getTracks().forEach((track) => {
                track.stop();
                console.log(`Stopped track: ${track.kind}`);
            });
            this.localStream = null;
        }

        // Close all peer connections
        this.peerConnections.forEach((pc, peerId) => {
            console.log(`Closing connection to ${peerId}`);
            pc.close();
        });
        this.peerConnections.clear();
        this.pendingCandidates.clear();
    }

    // Create peer connection for a remote peer
    async createPeerConnection(
        remotePeerId: string,
        isInitiator: boolean
    ): Promise<RTCPeerConnection> {
        console.log(
            `Creating peer connection with ${remotePeerId}, isInitiator: ${isInitiator}`
        );

        // If connection already exists, return it
        if (this.peerConnections.has(remotePeerId)) {
            console.log(`Connection to ${remotePeerId} already exists`);
            return this.peerConnections.get(remotePeerId)!;
        }

        const peerConnection = new RTCPeerConnection(configuration);
        this.peerConnections.set(remotePeerId, peerConnection);

        // Add local stream tracks to peer connection
        if (this.localStream) {
            console.log(`Adding ${this.localStream.getTracks().length} tracks to connection`);
            this.localStream.getTracks().forEach((track) => {
                console.log(`Adding ${track.kind} track to peer connection`);
                peerConnection.addTrack(track, this.localStream!);
            });
        } else {
            console.warn("No local stream available to add to peer connection");
        }

        // Handle ICE candidates
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                console.log(`Sending ICE candidate to ${remotePeerId}`);
                this.socket.emit("ice-candidate", {
                    to: remotePeerId,
                    candidate: event.candidate.toJSON(),
                    from: this.myUserId,
                });
            } else {
                console.log("All ICE candidates have been sent");
            }
        };

        // Handle ICE connection state changes
        peerConnection.oniceconnectionstatechange = () => {
            console.log(
                `ICE connection state with ${remotePeerId}: ${peerConnection.iceConnectionState}`
            );

            if (
                peerConnection.iceConnectionState === "failed" ||
                peerConnection.iceConnectionState === "disconnected" ||
                peerConnection.iceConnectionState === "closed"
            ) {
                console.log(`Connection to ${remotePeerId} failed or disconnected`);
                this.removePeer(remotePeerId);
            }
        };

        // Handle connection state changes
        peerConnection.onconnectionstatechange = () => {
            console.log(
                `Connection state with ${remotePeerId}: ${peerConnection.connectionState}`
            );
        };

        // Handle ICE gathering state
        peerConnection.onicegatheringstatechange = () => {
            console.log(
                `ICE gathering state with ${remotePeerId}: ${peerConnection.iceGatheringState}`
            );
        };

        // Handle signaling state
        peerConnection.onsignalingstatechange = () => {
            console.log(
                `Signaling state with ${remotePeerId}: ${peerConnection.signalingState}`
            );
        };

        // Handle remote stream
        peerConnection.ontrack = (event) => {
            console.log(
                `Received remote track from ${remotePeerId}: ${event.track.kind}`
            );

            if (event.streams && event.streams[0]) {
                console.log(`Remote stream has ${event.streams[0].getTracks().length} tracks`);
                this.onRemoteStream(remotePeerId, event.streams[0]);
            } else {
                console.warn("Received track without stream");
            }
        };

        // If initiator, create and send offer
        if (isInitiator) {
            try {
                console.log(`Creating offer for ${remotePeerId}`);

                const offer = await peerConnection.createOffer({
                    offerToReceiveAudio: true,
                    offerToReceiveVideo: true,
                });

                console.log(`Setting local description for ${remotePeerId}`);
                await peerConnection.setLocalDescription(offer);

                const roomWithOffer = {
                    to: remotePeerId,
                    offer: {
                        type: offer.type,
                        sdp: offer.sdp,
                    },
                    from: this.myUserId,
                };

                console.log(`Sending offer to ${remotePeerId}`);
                this.socket.emit("offer", roomWithOffer);
            } catch (error) {
                console.error(`Error creating offer for ${remotePeerId}:`, error);
                this.removePeer(remotePeerId);
            }
        }

        return peerConnection;
    }

    // Handle received offer
    async handleOffer(
        remotePeerId: string,
        offer: RTCSessionDescriptionInit
    ): Promise<void> {
        console.log(`Received offer from ${remotePeerId}`);

        try {
            let peerConnection = this.peerConnections.get(remotePeerId);

            if (!peerConnection) {
                console.log(`Creating new peer connection for ${remotePeerId}`);
                peerConnection = await this.createPeerConnection(remotePeerId, false);
            }

            console.log(`Setting remote description from ${remotePeerId}`);
            await peerConnection.setRemoteDescription(
                new RTCSessionDescription(offer)
            );

            console.log(`Creating answer for ${remotePeerId}`);
            const answer = await peerConnection.createAnswer();

            console.log(`Setting local description (answer) for ${remotePeerId}`);
            await peerConnection.setLocalDescription(answer);

            const roomWithAnswer = {
                to: remotePeerId,
                answer: {
                    type: answer.type,
                    sdp: answer.sdp,
                },
                from: this.myUserId,
            };

            console.log(`Sending answer to ${remotePeerId}`);
            this.socket.emit("answer", roomWithAnswer);

            // Process any pending ICE candidates
            if (this.pendingCandidates.has(remotePeerId)) {
                console.log(
                    `Processing ${this.pendingCandidates.get(remotePeerId)!.length} pending candidates for ${remotePeerId}`
                );

                const candidates = this.pendingCandidates.get(remotePeerId)!;
                for (const candidate of candidates) {
                    await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
                }
                this.pendingCandidates.delete(remotePeerId);
            }
        } catch (error) {
            console.error(`Error handling offer from ${remotePeerId}:`, error);
        }
    }

    // Handle received answer
    async handleAnswer(
        remotePeerId: string,
        answer: RTCSessionDescriptionInit
    ): Promise<void> {
        console.log(`Received answer from ${remotePeerId}`);

        const peerConnection = this.peerConnections.get(remotePeerId);

        if (peerConnection) {
            try {
                console.log(`Setting remote description (answer) from ${remotePeerId}`);
                await peerConnection.setRemoteDescription(
                    new RTCSessionDescription(answer)
                );

                // Process any pending ICE candidates
                if (this.pendingCandidates.has(remotePeerId)) {
                    console.log(
                        `Processing ${this.pendingCandidates.get(remotePeerId)!.length} pending candidates for ${remotePeerId}`
                    );

                    const candidates = this.pendingCandidates.get(remotePeerId)!;
                    for (const candidate of candidates) {
                        await peerConnection.addIceCandidate(
                            new RTCIceCandidate(candidate)
                        );
                    }
                    this.pendingCandidates.delete(remotePeerId);
                }
            } catch (error) {
                console.error(`Error handling answer from ${remotePeerId}:`, error);
            }
        } else {
            console.warn(`No peer connection found for ${remotePeerId}`);
        }
    }

    // Handle received ICE candidate
    async handleIceCandidate(
        remotePeerId: string,
        candidate: RTCIceCandidateInit
    ): Promise<void> {
        console.log(`Received ICE candidate from ${remotePeerId}`);

        const peerConnection = this.peerConnections.get(remotePeerId);

        if (peerConnection) {
            // Check if remote description is set
            if (peerConnection.remoteDescription) {
                try {
                    console.log(`Adding ICE candidate from ${remotePeerId}`);
                    await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
                } catch (error) {
                    console.error(`Error adding ICE candidate from ${remotePeerId}:`, error);
                }
            } else {
                // Queue the candidate until remote description is set
                console.log(`Queuing ICE candidate from ${remotePeerId} (no remote description yet)`);

                if (!this.pendingCandidates.has(remotePeerId)) {
                    this.pendingCandidates.set(remotePeerId, []);
                }
                this.pendingCandidates.get(remotePeerId)!.push(candidate);
            }
        } else {
            console.warn(
                `Received ICE candidate from ${remotePeerId} but no peer connection exists`
            );
        }
    }

    // Remove peer connection
    removePeer(remotePeerId: string): void {
        console.log(`Removing peer connection to ${remotePeerId}`);

        const peerConnection = this.peerConnections.get(remotePeerId);

        if (peerConnection) {
            peerConnection.close();
            this.peerConnections.delete(remotePeerId);
            this.pendingCandidates.delete(remotePeerId);
            this.onPeerDisconnected(remotePeerId);
        }
    }

    // Get all connected peer IDs
    getConnectedPeers(): string[] {
        return Array.from(this.peerConnections.keys());
    }

    // Clean up all connections
    cleanup(): void {
        console.log("Cleaning up WebRTC manager");
        this.stopScreenShare();
    }
}