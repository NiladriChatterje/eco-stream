const forge = require("node-forge");
const fs = require("fs");

console.log("Generating SSL certificates for frontend...");

// Generate a key pair
const keys = forge.pki.rsa.generateKeyPair(2048);

// Create a certificate
const cert = forge.pki.createCertificate();
cert.publicKey = keys.publicKey;
cert.serialNumber = "01";
cert.validity.notBefore = new Date();
cert.validity.notAfter = new Date();
cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);

const attrs = [
    { name: "commonName", value: "localhost" },
    { name: "countryName", value: "US" },
    { shortName: "ST", value: "State" },
    { name: "localityName", value: "City" },
    { name: "organizationName", value: "Frontend Dev" },
    { shortName: "OU", value: "Development" },
];

cert.setSubject(attrs);
cert.setIssuer(attrs);

cert.setExtensions([
    {
        name: "basicConstraints",
        cA: true,
    },
    {
        name: "keyUsage",
        keyCertSign: true,
        digitalSignature: true,
        nonRepudiation: true,
        keyEncipherment: true,
        dataEncipherment: true,
    },
    {
        name: "extKeyUsage",
        serverAuth: true,
        clientAuth: true,
        codeSigning: true,
        emailProtection: true,
        timeStamping: true,
    },
    {
        name: "nsCertType",
        client: true,
        server: true,
        email: true,
        objsign: true,
        sslCA: true,
        emailCA: true,
        objCA: true,
    },
    {
        name: "subjectAltName",
        altNames: [
            {
                type: 2, // DNS
                value: "localhost",
            },
            {
                type: 7, // IP
                ip: "127.0.0.1",
            },
        ],
    },
]);

// Self-sign certificate
cert.sign(keys.privateKey, forge.md.sha256.create());

// Convert to PEM format
const pemKey = forge.pki.privateKeyToPem(keys.privateKey);
const pemCert = forge.pki.certificateToPem(cert);

// Write to files
fs.writeFileSync("frontend/key.pem", pemKey);
fs.writeFileSync("frontend/cert.pem", pemCert);

console.log("SSL certificates generated successfully!");
console.log("Files created:");
console.log("  - frontend/key.pem");
console.log("  - frontend/cert.pem");