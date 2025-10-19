const selfsigned = require('selfsigned');
const fs = require('fs');

// Generate a self-signed certificate
const attrs = [{ name: 'commonName', value: 'localhost' }];
const pems = selfsigned.generate(attrs, {
    days: 365,
    keySize: 2048,
    extensions: [{
        name: 'basicConstraints',
        cA: true
    }, {
        name: 'keyUsage',
        keyCertSign: true,
        digitalSignature: true,
        nonRepudiation: true,
        keyEncipherment: true,
        dataEncipherment: true
    }, {
        name: 'subjectAltName',
        altNames: [{
            type: 2, // DNS
            value: 'localhost'
        }, {
            type: 7, // IP
            ip: '127.0.0.1'
        }]
    }]
});

// Write the certificate and private key to files
fs.writeFileSync('key.pem', pems.private);
fs.writeFileSync('cert.pem', pems.cert);

console.log('SSL certificates generated successfully!');
console.log('Private key saved to: key.pem');
console.log('Certificate saved to: cert.pem');