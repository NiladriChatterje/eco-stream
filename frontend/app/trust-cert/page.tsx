"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function TrustCertPage() {
    const [backendTrusted, setBackendTrusted] = useState(false);
    const [backendError, setBackendError] = useState("");
    const [testing, setTesting] = useState(false);
    const router = useRouter();

    const testBackendConnection = async () => {
        setTesting(true);
        setBackendError("");

        try {
            const response = await fetch("https://localhost:5010/api/rooms");
            if (response.ok) {
                setBackendTrusted(true);
                setBackendError("");
            } else {
                setBackendError(`Server responded with status: ${response.status}`);
            }
        } catch (error: any) {
            setBackendError(error.message || "Connection failed");
            setBackendTrusted(false);
        } finally {
            setTesting(false);
        }
    };

    useEffect(() => {
        // Auto-test on component mount
        testBackendConnection();
    }, []);

    const openBackendInNewTab = () => {
        window.open("https://localhost:5010", "_blank");
    };

    return (
        <div className="container">
            <div className="header">
                <h1>🔒 SSL Certificate Setup</h1>
                <p>Trust the backend certificate to enable socket.io connections</p>
            </div>

            <div className="main-content">
                <div className="welcome-section">
                    <div className="info-box" style={{ marginBottom: "20px" }}>
                        <h3>⚠️ Why is this needed?</h3>
                        <p>
                            This application uses HTTPS with self-signed certificates for local development.
                            Your browser doesn't trust these certificates by default, which prevents the
                            socket.io connection from working.
                        </p>
                        <p style={{ marginTop: "10px" }}>
                            <strong>You need to manually trust the backend certificate.</strong>
                        </p>
                    </div>

                    <div className="control-panel">
                        <h2>Setup Steps</h2>

                        <div className="info-box">
                            <h3>Step 1: Frontend Certificate (Already Done ✓)</h3>
                            <p>
                                Since you can see this page, you've already trusted the frontend certificate at
                                <code style={{ background: "#333", padding: "2px 6px", borderRadius: "3px", margin: "0 4px" }}>
                                    https://localhost:3000
                                </code>
                            </p>
                        </div>

                        <div className="info-box" style={{ marginTop: "20px" }}>
                            <h3>Step 2: Backend Certificate</h3>
                            <p style={{ marginBottom: "15px" }}>
                                Click the button below to open the backend server in a new tab:
                            </p>

                            <button
                                onClick={openBackendInNewTab}
                                className="button-success"
                                style={{ marginBottom: "15px" }}
                            >
                                🔓 Open Backend Server (https://localhost:5010)
                            </button>

                            <div style={{ background: "#2a2a2a", padding: "15px", borderRadius: "8px", marginTop: "15px" }}>
                                <p style={{ margin: "0 0 10px 0", fontWeight: "bold" }}>When the new tab opens:</p>
                                <ol style={{ margin: "0", paddingLeft: "20px" }}>
                                    <li>You'll see a security warning</li>
                                    <li>Click <strong>"Advanced"</strong> or <strong>"Show Details"</strong></li>
                                    <li>Click <strong>"Proceed to localhost (unsafe)"</strong> or <strong>"Accept the Risk and Continue"</strong></li>
                                    <li>You should see <code style={{ background: "#333", padding: "2px 6px", borderRadius: "3px" }}>Cannot GET /</code> - this is normal!</li>
                                    <li>Close that tab and come back here</li>
                                </ol>
                            </div>
                        </div>

                        <div className="info-box" style={{ marginTop: "20px" }}>
                            <h3>Step 3: Verify Connection</h3>
                            <p style={{ marginBottom: "15px" }}>
                                After trusting the backend certificate, click the button below to test the connection:
                            </p>

                            <button
                                onClick={testBackendConnection}
                                disabled={testing}
                                className={backendTrusted ? "button-success" : "button-secondary"}
                                style={{ marginBottom: "15px" }}
                            >
                                {testing ? "Testing..." : backendTrusted ? "✓ Backend Connected!" : "🔄 Test Backend Connection"}
                            </button>

                            {backendError && (
                                <div style={{
                                    background: "#ff4444",
                                    color: "white",
                                    padding: "10px",
                                    borderRadius: "5px",
                                    marginTop: "10px"
                                }}>
                                    <strong>❌ Connection Failed:</strong> {backendError}
                                    <p style={{ margin: "10px 0 0 0", fontSize: "14px" }}>
                                        Make sure you've trusted the backend certificate by clicking the button above.
                                    </p>
                                </div>
                            )}

                            {backendTrusted && (
                                <div style={{
                                    background: "#44ff44",
                                    color: "#003300",
                                    padding: "10px",
                                    borderRadius: "5px",
                                    marginTop: "10px",
                                    fontWeight: "bold"
                                }}>
                                    ✓ Backend connection successful! You can now use the app.
                                </div>
                            )}
                        </div>

                        {backendTrusted && (
                            <div style={{ marginTop: "30px", textAlign: "center" }}>
                                <button
                                    onClick={() => router.push("/")}
                                    className="button-success"
                                    style={{ fontSize: "18px", padding: "15px 30px" }}
                                >
                                    🎉 Continue to App
                                </button>
                            </div>
                        )}

                        <div className="info-box" style={{ marginTop: "30px", background: "#2a2a2a" }}>
                            <h3>📚 Browser-Specific Instructions</h3>
                            <div style={{ marginTop: "10px" }}>
                                <p><strong>Chrome/Edge:</strong></p>
                                <p style={{ paddingLeft: "15px", margin: "5px 0" }}>
                                    "Your connection is not private" → Advanced → Proceed to localhost (unsafe)
                                </p>
                            </div>
                            <div style={{ marginTop: "10px" }}>
                                <p><strong>Firefox:</strong></p>
                                <p style={{ paddingLeft: "15px", margin: "5px 0" }}>
                                    "Warning: Potential Security Risk Ahead" → Advanced... → Accept the Risk and Continue
                                </p>
                            </div>
                            <div style={{ marginTop: "10px" }}>
                                <p><strong>Safari:</strong></p>
                                <p style={{ paddingLeft: "15px", margin: "5px 0" }}>
                                    "This Connection Is Not Private" → Show Details → visit this website → Visit Website
                                </p>
                            </div>
                        </div>

                        <div className="info-box" style={{ marginTop: "20px", background: "#1a3a5a" }}>
                            <h3>ℹ️ Important Notes</h3>
                            <ul style={{ margin: "10px 0", paddingLeft: "20px" }}>
                                <li>This is only needed for local development with self-signed certificates</li>
                                <li>In production, you would use proper SSL certificates from a trusted authority</li>
                                <li>You may need to repeat this if you clear browser data or use incognito mode</li>
                                <li>Both certificates (frontend & backend) must be trusted for the app to work</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}